import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

import type { EngineReadCacheResource } from "./engine/adapter.js";
import { errorToLogDetails, writeErrorLog, writeInfoLog } from "./services/logger.js";
import { getStaticDir } from "./runtime-paths.js";
import { findRouteDefinition } from "./routes/index.js";
import { createServerContext } from "./routes/server-context.js";
import { getProductVersion } from "./product-version.js";
export {
  clearRuntimeUninstallState,
  resetStateAfterRuntimeUninstall,
  shouldResetStateAfterDeploymentUninstall
} from "./routes/runtime-reset.js";

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 0;
const RUNTIME_UPDATE_CHECK_INTERVAL_MS = Number(process.env.CHILLCLAW_RUNTIME_UPDATE_CHECK_INTERVAL_MS ?? 6 * 60 * 60 * 1000);

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
  });
  response.end(JSON.stringify(body));
}

function contentTypeFor(pathname: string): string {
  switch (extname(pathname)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/plain; charset=utf-8";
  }
}

async function serveStaticAsset(requestUrl: string, response: ServerResponse): Promise<boolean> {
  const staticDir = getStaticDir();

  if (!staticDir) {
    return false;
  }

  const pathname = requestUrl === "/" ? "/index.html" : requestUrl;
  const requestedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const assetPath = join(staticDir, requestedPath);
  const fallbackPath = join(staticDir, "index.html");

  try {
    const payload = await readFile(assetPath);
    response.writeHead(200, { "Content-Type": contentTypeFor(assetPath) });
    response.end(payload);
    return true;
  } catch {
    try {
      const fallback = await readFile(fallbackPath);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(fallback);
      return true;
    } catch (error) {
      void writeErrorLog("ChillClaw could not serve a static asset or the packaged UI fallback.", {
        requestUrl,
        assetPath,
        fallbackPath,
        error: errorToLogDetails(error)
      }, {
        scope: "server.serveStaticAsset"
      });
      return false;
    }
  }
}

export function resolveFreshReadInvalidationTargets(method: string, pathname: string): EngineReadCacheResource[] {
  const matched = findRouteDefinition(method, pathname);
  return matched?.route.freshReadInvalidationTargets ?? [];
}

export function shouldPublishSnapshotForRoute(method: string, pathname: string): boolean {
  const matched = findRouteDefinition(method, pathname);
  return matched?.route.snapshotPolicy !== "silent";
}

export function startServer(port = 4545) {
  let server: ReturnType<typeof createServer>;
  const context = createServerContext(() => {
    server.close();
  });
  void context.downloadManager.resumePersistedJobs().catch((error) => {
    void writeErrorLog("ChillClaw could not resume pending downloads on startup.", {
      error: errorToLogDetails(error)
    }, {
      scope: "server.startServer.resumeDownloads"
    });
  });
  void context.localModelRuntimeService.resumePendingWork().catch((error) => {
    void writeErrorLog("ChillClaw could not resume a pending local-model download on startup.", {
      error: errorToLogDetails(error)
    }, {
      scope: "server.startServer.resumePendingLocalModelRuntime"
    });
  });
  scheduleRuntimeUpdateStaging(context);
  const eventSocketServer = new WebSocketServer({ noServer: true });
  const EVENT_SOCKET_HEARTBEAT_INTERVAL_MS = 15_000;

  eventSocketServer.on("connection", (socket: WebSocket) => {
    const sendEvent = (event: unknown) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    };

    for (const event of context.eventBus.getRetainedEvents()) {
      sendEvent(event);
    }

    const unsubscribe = context.eventBus.subscribe((event) => {
      sendEvent(event);
    });
    const heartbeatTimer = setInterval(() => {
      sendEvent({
        type: "daemon.heartbeat",
        sentAt: new Date().toISOString()
      });
    }, EVENT_SOCKET_HEARTBEAT_INTERVAL_MS);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      clearInterval(heartbeatTimer);
      unsubscribe();
    };

    socket.on("close", cleanup);
    socket.on("error", () => {
      cleanup();
    });
  });

  server = createServer(async (request, response) => {
    request.on("error", (error) => {
      void writeErrorLog("Incoming daemon request stream failed.", {
        method: request.method,
        url: request.url,
        error: errorToLogDetails(error)
      }, {
        scope: "server.requestHandler.requestStreamError"
      });
    });

    if (!request.url || !request.method) {
      void writeErrorLog("ChillClaw daemon received a malformed request.", {
        method: request.method,
        url: request.url
      }, {
        scope: "server.requestHandler.malformedRequest"
      });
      sendJson(response, 400, { error: "Malformed request." });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = requestUrl.pathname;
      const freshRead = requestUrl.searchParams.get("fresh") === "1";

      if (freshRead) {
        const invalidationTargets = resolveFreshReadInvalidationTargets(request.method, pathname);
        if (invalidationTargets.length > 0) {
          context.adapter.invalidateReadCaches(invalidationTargets);
        }
      }

      const matched = findRouteDefinition(request.method, pathname);
      if (matched) {
        const result = await matched.route.handle({
          context,
          request,
          requestUrl,
          pathname,
          params: matched.params
        });
        sendJson(response, result.statusCode ?? 200, result.body);
        return;
      }

      if (request.method === "GET" && !pathname.startsWith("/api/")) {
        if (await serveStaticAsset(pathname, response)) {
          return;
        }
      }

      void writeErrorLog("Daemon API route not found.", {
        method: request.method,
        url: request.url
      }, {
        scope: "server.requestHandler.routeNotFound"
      });
      sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void writeErrorLog("Daemon request failed.", {
        method: request.method,
        url: request.url,
        error: errorToLogDetails(error)
      }, {
        scope: "server.requestHandler.unhandledError"
      });
      sendJson(response, 500, { error: message });
    }
  });
  // Managed runtime installs can exceed any fixed request budget on slow networks.
  server.requestTimeout = LONG_RUNNING_REQUEST_TIMEOUT_MS;

  server.on("error", (error) => {
    void writeErrorLog("ChillClaw daemon server emitted an error.", errorToLogDetails(error), {
      scope: "server.startServer.serverError"
    });
  });

  server.on("clientError", (error, socket) => {
    void writeErrorLog("ChillClaw daemon rejected a malformed client connection.", errorToLogDetails(error), {
      scope: "server.startServer.clientError"
    });
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  });

  server.on("upgrade", (request, socket, head) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/api/events") {
        socket.destroy();
        return;
      }

      eventSocketServer.handleUpgrade(request, socket, head, (webSocket: WebSocket) => {
        eventSocketServer.emit("connection", webSocket, request);
      });
    } catch {
      socket.destroy();
    }
  });

  server.listen(port, "127.0.0.1");
  void writeInfoLog("ChillClaw daemon server started.", {
    port,
    appVersion: getProductVersion()
  }, {
    scope: "server.startServer"
  });

  return server;
}

function scheduleRuntimeUpdateStaging(context: ReturnType<typeof createServerContext>): void {
  const run = () => {
    void context.runtimeManager.stageApprovedUpdates().catch((error) => {
      void writeErrorLog("ChillClaw could not stage approved runtime updates in the background.", {
        error: errorToLogDetails(error)
      }, {
        scope: "server.runtimeUpdateStaging"
      });
    });
  };

  run();

  if (RUNTIME_UPDATE_CHECK_INTERVAL_MS > 0) {
    const timer = setInterval(run, RUNTIME_UPDATE_CHECK_INTERVAL_MS);
    timer.unref?.();
  }
}
