import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import type {
  PairingApprovalRequest,
  EngineTaskRequest,
  InstallRequest,
  ModelAuthSessionInputRequest,
  ModelAuthRequest,
  OnboardingSelection,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
  SetDefaultModelRequest,
  SetDefaultModelEntryRequest,
  FeishuSetupRequest,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";

import { createEngineAdapter } from "./engine/registry.js";
import { AppControlService } from "./services/app-control-service.js";
import { AppServiceManager } from "./services/app-service-manager.js";
import { ChannelSetupService } from "./services/channel-setup-service.js";
import { errorToLogDetails, writeErrorLog, writeInfoLog } from "./services/logger.js";
import { OverviewService } from "./services/overview-service.js";
import { SetupService } from "./services/setup-service.js";
import { StateStore } from "./services/state-store.js";
import { TaskService } from "./services/task-service.js";
import { getDataDir, getStaticDir } from "./runtime-paths.js";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
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
  const channelSetupService = new ChannelSetupService(adapter, store, overviewService);
  const setupService = new SetupService(adapter, store, overviewService);
  const taskService = new TaskService(adapter, store);
  let server: ReturnType<typeof createServer>;
  const appControlService = new AppControlService(() => {
    server.close();
  });

  server = createServer(async (request, response) => {
    if (!request.url || !request.method) {
      sendJson(response, 400, { error: "Malformed request." });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    try {
      if (request.method === "GET" && request.url === "/api/ping") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && request.url === "/api/overview") {
        sendJson(response, 200, await overviewService.getOverview());
        return;
      }

      if (request.method === "GET" && request.url === "/api/deploy/targets") {
        sendJson(response, 200, await adapter.getDeploymentTargets());
        return;
      }

      if (
        request.method === "POST" &&
        (request.url === "/api/deploy/targets/standard/update" ||
          request.url === "/api/deploy/targets/managed-local/update")
      ) {
        const targetId = request.url.includes("/managed-local/") ? "managed-local" : "standard";
        sendJson(response, 200, await adapter.updateDeploymentTarget(targetId));
        return;
      }

      if (request.method === "GET" && request.url === "/api/models/config") {
        sendJson(response, 200, await adapter.getModelConfig());
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/entries") {
        const body = await readJson<SaveModelEntryRequest>(request);
        sendJson(response, 200, await adapter.createSavedModelEntry(body));
        return;
      }

      if (request.method === "PATCH" && request.url.startsWith("/api/models/entries/")) {
        const entryId = request.url.slice("/api/models/entries/".length);
        const body = await readJson<SaveModelEntryRequest>(request);
        sendJson(response, 200, await adapter.updateSavedModelEntry(entryId, body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/default-entry") {
        const body = await readJson<SetDefaultModelEntryRequest>(request);
        sendJson(response, 200, await adapter.setDefaultModelEntry(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/fallbacks") {
        const body = await readJson<ReplaceFallbackModelEntriesRequest>(request);
        sendJson(response, 200, await adapter.replaceFallbackModelEntries(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/auth") {
        const body = await readJson<ModelAuthRequest>(request);
        sendJson(response, 200, await adapter.authenticateModelProvider(body));
        return;
      }

      if (request.method === "GET" && request.url.startsWith("/api/models/auth/session/")) {
        const sessionId = request.url.slice("/api/models/auth/session/".length);
        sendJson(response, 200, await adapter.getModelAuthSession(sessionId));
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/models/auth/session/") && request.url.endsWith("/input")) {
        const sessionId = request.url.slice("/api/models/auth/session/".length, -"/input".length);
        const body = await readJson<ModelAuthSessionInputRequest>(request);
        sendJson(response, 200, await adapter.submitModelAuthSessionInput(sessionId, body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/default") {
        const body = await readJson<SetDefaultModelRequest>(request);
        sendJson(response, 200, await adapter.setDefaultModel(body.modelKey));
        return;
      }

      if (request.method === "POST" && request.url === "/api/install") {
        const body = await readJson<InstallRequest>(request);
        const result = await adapter.install(body.autoConfigure ?? true, { forceLocal: body.forceLocal ?? false });
        sendJson(response, 200, {
          install: result,
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/engine/uninstall") {
        const result = await adapter.uninstall();
        await store.update((current) => ({
          ...current,
          setupCompletedAt: undefined,
          selectedProfileId: undefined,
          channelOnboarding: undefined
        }));
        sendJson(response, 200, {
          result,
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/first-run/intro") {
        sendJson(response, 200, await setupService.markIntroCompleted());
        return;
      }

      if (request.method === "POST" && request.url === "/api/first-run/setup") {
        const body = await readJson<InstallRequest>(request);
        sendJson(response, 200, await setupService.runFirstRunSetup({ forceLocal: body.forceLocal ?? false }));
        return;
      }

      if (request.method === "POST" && request.url === "/api/onboarding") {
        const body = await readJson<OnboardingSelection>(request);
        sendJson(response, 200, await overviewService.completeOnboarding(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/telegram") {
        const body = await readJson<TelegramSetupRequest>(request);
        sendJson(response, 200, await channelSetupService.configureTelegram(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/telegram/approve") {
        const body = await readJson<PairingApprovalRequest>(request);
        sendJson(response, 200, await channelSetupService.approvePairing("telegram", body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/whatsapp/login") {
        sendJson(response, 200, await channelSetupService.startWhatsappLogin());
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/whatsapp/approve") {
        const body = await readJson<PairingApprovalRequest>(request);
        sendJson(response, 200, await channelSetupService.approvePairing("whatsapp", body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/wechat") {
        const body = await readJson<WechatSetupRequest>(request);
        sendJson(response, 200, await channelSetupService.configureWechatWorkaround(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/feishu") {
        const body = await readJson<FeishuSetupRequest>(request);
        sendJson(response, 200, await channelSetupService.configureFeishu(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/feishu/prepare") {
        sendJson(response, 200, await channelSetupService.prepareFeishu());
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/feishu/approve") {
        const body = await readJson<PairingApprovalRequest>(request);
        sendJson(response, 200, await channelSetupService.approvePairing("feishu", body));
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        request.url.startsWith("/api/channels/feishu/callback")
      ) {
        const body = request.method === "POST" ? await readJson<Record<string, unknown>>(request) : {};
        const challenge =
          typeof body.challenge === "string"
            ? body.challenge
            : typeof body.encrypt === "string"
              ? body.encrypt
              : undefined;
        sendJson(response, 200, challenge ? { challenge } : { ok: true, message: "SlackClaw Feishu callback is reachable." });
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/gateway/start") {
        sendJson(response, 200, await channelSetupService.startGateway());
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

      if (request.method === "POST" && request.url === "/api/app/stop") {
        sendJson(response, 200, await appControlService.stopApp());
        return;
      }

      if (request.method === "POST" && request.url === "/api/app/uninstall") {
        sendJson(response, 200, await appControlService.uninstallApp());
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

      void writeErrorLog("Daemon API route not found.", {
        method: request.method,
        url: request.url
      });
      sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void writeErrorLog("Daemon request failed.", {
        method: request.method,
        url: request.url,
        error: errorToLogDetails(error)
      });
      sendJson(response, 500, { error: message });
    }
  });

  server.listen(port, "127.0.0.1");
  void writeInfoLog("SlackClaw daemon server started.", {
    port,
    appVersion: "0.1.2"
  });

  return server;
}
