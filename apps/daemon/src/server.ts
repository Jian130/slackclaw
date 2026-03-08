import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import type {
  EngineTaskRequest,
  InstallRequest,
  OnboardingSelection
} from "@slackclaw/contracts";

import { createEngineAdapter } from "./engine/registry.js";
import { AppServiceManager } from "./services/app-service-manager.js";
import { OverviewService } from "./services/overview-service.js";
import { StateStore } from "./services/state-store.js";
import { TaskService } from "./services/task-service.js";
import { getDataDir, getStaticDir } from "./runtime-paths.js";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(body));
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as T) : ({} as T);
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
    } catch {
      return false;
    }
  }
}

export function startServer(port = 4545) {
  const adapter = createEngineAdapter();
  const store = new StateStore();
  const appServiceManager = new AppServiceManager();
  const overviewService = new OverviewService(adapter, store, appServiceManager);
  const taskService = new TaskService(adapter, store);

  const server = createServer(async (request, response) => {
    if (!request.url || !request.method) {
      sendJson(response, 400, { error: "Malformed request." });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    try {
      if (request.method === "GET" && request.url === "/api/overview") {
        sendJson(response, 200, await overviewService.getOverview());
        return;
      }

      if (request.method === "POST" && request.url === "/api/install") {
        const body = await readJson<InstallRequest>(request);
        const result = await adapter.install(body.autoConfigure ?? true);
        sendJson(response, 200, {
          install: result,
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/onboarding") {
        const body = await readJson<OnboardingSelection>(request);
        sendJson(response, 200, await overviewService.completeOnboarding(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/tasks") {
        const body = await readJson<EngineTaskRequest>(request);
        sendJson(response, 200, await taskService.runTask(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/update") {
        sendJson(response, 200, await adapter.update());
        return;
      }

      if (request.method === "GET" && request.url === "/api/service/status") {
        sendJson(response, 200, await appServiceManager.getStatus());
        return;
      }

      if (request.method === "POST" && request.url === "/api/service/install") {
        sendJson(response, 200, {
          result: await appServiceManager.install(),
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/service/restart") {
        sendJson(response, 200, {
          result: await appServiceManager.restart(),
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/service/uninstall") {
        sendJson(response, 200, {
          result: await appServiceManager.uninstall(),
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "GET" && request.url === "/api/diagnostics") {
        const bundle = await adapter.exportDiagnostics();
        const diagnosticsPath = resolve(getDataDir(), bundle.filename);
        await writeFile(diagnosticsPath, bundle.content);
        sendJson(response, 200, {
          message: "Diagnostics bundle exported.",
          path: diagnosticsPath
        });
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/recovery/")) {
        const actionId = request.url.replace("/api/recovery/", "");
        const action = await overviewService.findRecoveryAction(actionId);

        if (!action) {
          sendJson(response, 404, { error: "Unknown recovery action." });
          return;
        }

        sendJson(response, 200, {
          result: await adapter.repair(action),
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "GET" && !request.url.startsWith("/api/")) {
        if (await serveStaticAsset(request.url, response)) {
          return;
        }
      }

      sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(response, 500, { error: message });
    }
  });

  server.listen(port, "127.0.0.1");

  return server;
}
