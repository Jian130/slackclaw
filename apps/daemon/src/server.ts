import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

import type {
  AbortChatRequest,
  BindAIMemberChannelRequest,
  CompleteOnboardingRequest,
  CreateChatThreadRequest,
  DeleteAIMemberRequest,
  DeploymentTargetActionResponse,
  InstallSkillRequest,
  SendChatMessageRequest,
  SaveAIMemberRequest,
  SaveTeamRequest,
  ChannelSessionInputRequest,
  RemoveChannelEntryRequest,
  RemoveSkillRequest,
  SaveChannelEntryRequest,
  SaveCustomSkillRequest,
  EngineTaskRequest,
  InstallRequest,
  ModelAuthSessionInputRequest,
  ModelAuthRequest,
  ReplaceFallbackModelEntriesRequest,
  SaveModelEntryRequest,
  SetDefaultModelRequest,
  SetDefaultModelEntryRequest,
  UpdateOnboardingStateRequest,
  UpdateSkillRequest
} from "@slackclaw/contracts";

import { createEngineAdapter } from "./engine/registry.js";
import type { EngineReadCacheResource } from "./engine/adapter.js";
import { createDefaultSecretsAdapter } from "./platform/macos-keychain-secrets-adapter.js";
import { AppControlService } from "./services/app-control-service.js";
import { AppServiceManager } from "./services/app-service-manager.js";
import { AITeamService } from "./services/ai-team-service.js";
import { ChatService } from "./services/chat-service.js";
import { ChannelSetupService } from "./services/channel-setup-service.js";
import { errorToLogDetails, writeErrorLog, writeInfoLog } from "./services/logger.js";
import { EventPublisher } from "./services/event-publisher.js";
import { OnboardingService } from "./services/onboarding-service.js";
import { OverviewService } from "./services/overview-service.js";
import { PluginService } from "./services/plugin-service.js";
import { PresetSkillService } from "./services/preset-skill-service.js";
import { SetupService } from "./services/setup-service.js";
import { SkillService } from "./services/skill-service.js";
import { StateStore, type AppState } from "./services/state-store.js";
import { TaskService } from "./services/task-service.js";
import { EventBusService } from "./services/event-bus-service.js";
import { getDataDir, getStaticDir } from "./runtime-paths.js";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
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
    } catch (error) {
      void writeErrorLog("SlackClaw could not serve a static asset or the packaged UI fallback.", {
        requestUrl,
        assetPath,
        fallbackPath,
        error: errorToLogDetails(error)
      });
      return false;
    }
  }
}

export function resolveFreshReadInvalidationTargets(method: string, pathname: string): EngineReadCacheResource[] {
  if (method !== "GET") {
    return [];
  }

  switch (pathname) {
    case "/api/overview":
      return ["engine", "channels"];
    case "/api/models/config":
      return ["models"];
    case "/api/channels/config":
      return ["channels", "engine"];
    case "/api/plugins/config":
      return ["plugins", "channels"];
    case "/api/skills/config":
      return ["skills"];
    case "/api/ai-team/overview":
      return ["models", "skills", "ai-members"];
    case "/api/onboarding/state":
      return ["engine", "channels", "models", "skills", "ai-members"];
    default:
      return [];
  }
}

export function resetStateAfterRuntimeUninstall(current: AppState): AppState {
  return {
    ...current,
    setupCompletedAt: undefined,
    selectedProfileId: undefined,
    onboarding: undefined,
    channelOnboarding: undefined
  };
}

export function shouldResetStateAfterDeploymentUninstall(result: DeploymentTargetActionResponse): boolean {
  return result.status === "completed" && !result.engineStatus.installed;
}

async function clearRuntimeUninstallState(store: StateStore): Promise<void> {
  await store.update((current) => resetStateAfterRuntimeUninstall(current));
}

export function startServer(port = 4545) {
  const adapter = createEngineAdapter();
  const secrets = createDefaultSecretsAdapter();
  const store = new StateStore();
  const appServiceManager = new AppServiceManager();
  const overviewService = new OverviewService(adapter, store, appServiceManager);
  const eventBus = new EventBusService();
  const eventPublisher = new EventPublisher(eventBus);
  const presetSkillService = new PresetSkillService(adapter, store, eventPublisher);
  const channelSetupService = new ChannelSetupService(adapter, store, eventPublisher, secrets);
  const pluginService = new PluginService(adapter, eventPublisher);
  const aiTeamService = new AITeamService(adapter, store, eventPublisher, presetSkillService);
  const chatService = new ChatService(adapter, store, aiTeamService, eventPublisher);
  const skillService = new SkillService(adapter, store, eventPublisher, presetSkillService);
  const setupService = new SetupService(adapter, store, overviewService, eventPublisher, presetSkillService);
  const onboardingService = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, presetSkillService);
  const taskService = new TaskService(adapter, store, eventPublisher);
  const eventSocketServer = new WebSocketServer({ noServer: true });
  let server: ReturnType<typeof createServer>;
  const appControlService = new AppControlService(() => {
    server.close();
  });

  eventSocketServer.on("connection", (socket: WebSocket) => {
    for (const event of eventBus.getRetainedEvents()) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    }

    const unsubscribe = eventBus.subscribe((event) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", () => {
      unsubscribe();
    });
  });

  server = createServer(async (request, response) => {
    request.on("error", (error) => {
      void writeErrorLog("Incoming daemon request stream failed.", {
        method: request.method,
        url: request.url,
        error: errorToLogDetails(error)
      });
    });

    if (!request.url || !request.method) {
      void writeErrorLog("SlackClaw daemon received a malformed request.", {
        method: request.method,
        url: request.url
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
          adapter.invalidateReadCaches(invalidationTargets);
        }
      }

      if (request.method === "GET" && pathname === "/api/ping") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && pathname === "/api/events") {
        sendJson(response, 426, { error: "Upgrade required. Connect with WebSocket." });
        return;
      }

      if (request.method === "GET" && pathname === "/api/overview") {
        const overview = await overviewService.getOverview();
        eventPublisher.publishOverviewUpdated(overview);
        sendJson(response, 200, overview);
        return;
      }

      if (request.method === "GET" && pathname === "/api/deploy/targets") {
        sendJson(response, 200, await adapter.instances.getDeploymentTargets());
        return;
      }

      if (
        request.method === "POST" &&
        (request.url === "/api/deploy/targets/standard/install" ||
          request.url === "/api/deploy/targets/managed-local/install")
      ) {
        const targetId = request.url.includes("/managed-local/") ? "managed-local" : "standard";
        const correlationId = randomUUID();
        eventPublisher.publishDeployProgress({
          correlationId,
          targetId,
          phase: "installing",
          percent: 10,
          message: `SlackClaw is installing the ${targetId} OpenClaw runtime.`
        });
        const result = await adapter.instances.installDeploymentTarget(targetId);
        eventPublisher.publishDeployCompleted({
          correlationId,
          targetId,
          status: result.status,
          message: result.message,
          engineStatus: result.engineStatus
        });
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "POST" &&
        (request.url === "/api/deploy/targets/standard/update" ||
          request.url === "/api/deploy/targets/managed-local/update")
      ) {
        const targetId = request.url.includes("/managed-local/") ? "managed-local" : "standard";
        const correlationId = randomUUID();
        eventPublisher.publishDeployProgress({
          correlationId,
          targetId,
          phase: "updating",
          percent: 10,
          message: `SlackClaw is updating the ${targetId} OpenClaw runtime.`
        });
        const result = await adapter.instances.updateDeploymentTarget(targetId);
        eventPublisher.publishDeployCompleted({
          correlationId,
          targetId,
          status: result.status,
          message: result.message,
          engineStatus: result.engineStatus
        });
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "POST" &&
        (request.url === "/api/deploy/targets/standard/uninstall" ||
          request.url === "/api/deploy/targets/managed-local/uninstall")
      ) {
        const targetId = request.url.includes("/managed-local/") ? "managed-local" : "standard";
        const correlationId = randomUUID();
        eventPublisher.publishDeployProgress({
          correlationId,
          targetId,
          phase: "uninstalling",
          percent: 10,
          message: `SlackClaw is removing the ${targetId} OpenClaw runtime.`
        });
        const result = await adapter.instances.uninstallDeploymentTarget(targetId);
        if (shouldResetStateAfterDeploymentUninstall(result)) {
          await clearRuntimeUninstallState(store);
        }
        eventPublisher.publishDeployCompleted({
          correlationId,
          targetId,
          status: result.status,
          message: result.message,
          engineStatus: result.engineStatus
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/deploy/gateway/restart") {
        const result = await adapter.gateway.restartGateway();
        eventPublisher.publishGatewayStatus({
          reachable: result.engineStatus.running && !result.engineStatus.pendingGatewayApply,
          pendingGatewayApply: Boolean(result.engineStatus.pendingGatewayApply),
          summary: result.engineStatus.summary
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "GET" && pathname === "/api/models/config") {
        const modelConfig = await adapter.config.getModelConfig();
        eventPublisher.publishModelConfigUpdated(modelConfig);
        sendJson(response, 200, modelConfig);
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/entries") {
        const body = await readJson<SaveModelEntryRequest>(request);
        const result = await adapter.config.createSavedModelEntry(body);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync, settled: result.status === "interactive" ? false : sync.settled });
        return;
      }

      if (request.method === "PATCH" && request.url.startsWith("/api/models/entries/")) {
        const entryId = request.url.slice("/api/models/entries/".length);
        const body = await readJson<SaveModelEntryRequest>(request);
        const result = await adapter.config.updateSavedModelEntry(entryId, body);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync, settled: result.status === "interactive" ? false : sync.settled });
        return;
      }

      if (request.method === "DELETE" && pathname.startsWith("/api/models/entries/")) {
        const entryId = pathname.slice("/api/models/entries/".length);
        const result = await adapter.config.removeSavedModelEntry(entryId);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync });
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/default-entry") {
        const body = await readJson<SetDefaultModelEntryRequest>(request);
        const result = await adapter.config.setDefaultModelEntry(body);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync });
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/fallbacks") {
        const body = await readJson<ReplaceFallbackModelEntriesRequest>(request);
        const result = await adapter.config.replaceFallbackModelEntries(body);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync });
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/auth") {
        const body = await readJson<ModelAuthRequest>(request);
        const result = await adapter.config.authenticateModelProvider(body);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync, settled: result.status === "interactive" ? false : sync.settled });
        return;
      }

      if (request.method === "GET" && request.url.startsWith("/api/models/auth/session/")) {
        const sessionId = request.url.slice("/api/models/auth/session/".length);
        sendJson(response, 200, await adapter.config.getModelAuthSession(sessionId));
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/models/auth/session/") && request.url.endsWith("/input")) {
        const sessionId = request.url.slice("/api/models/auth/session/".length, -"/input".length);
        const body = await readJson<ModelAuthSessionInputRequest>(request);
        sendJson(response, 200, await adapter.config.submitModelAuthSessionInput(sessionId, body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/models/default") {
        const body = await readJson<SetDefaultModelRequest>(request);
        const result = await adapter.config.setDefaultModel(body.modelKey);
        const sync = eventPublisher.publishModelConfigUpdated(result.modelConfig);
        sendJson(response, 200, { ...result, ...sync });
        return;
      }

      if (request.method === "POST" && request.url === "/api/install") {
        const body = await readJson<InstallRequest>(request);
        const result = await adapter.instances.install(body.autoConfigure ?? true, { forceLocal: body.forceLocal ?? false });
        sendJson(response, 200, {
          install: result,
          overview: await overviewService.getOverview()
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/engine/uninstall") {
        const result = await adapter.instances.uninstall();
        if (result.status === "completed" && !result.engineStatus.installed) {
          await clearRuntimeUninstallState(store);
        }
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

      if (request.method === "GET" && pathname === "/api/onboarding/state") {
        sendJson(response, 200, await onboardingService.getState());
        return;
      }

      if (request.method === "PATCH" && pathname === "/api/onboarding/state") {
        const body = await readJson<UpdateOnboardingStateRequest>(request);
        sendJson(response, 200, await onboardingService.updateState(body));
        return;
      }

      if (request.method === "POST" && pathname === "/api/onboarding/reset") {
        sendJson(response, 200, await onboardingService.reset());
        return;
      }

      if (request.method === "POST" && pathname === "/api/onboarding/complete") {
        const body = await readJson<CompleteOnboardingRequest>(request);
        sendJson(response, 200, await onboardingService.complete(body));
        return;
      }

      if (request.method === "GET" && pathname === "/api/channels/config") {
        const channelConfig = await channelSetupService.getConfigOverview();
        eventPublisher.publishChannelConfigUpdated(channelConfig);
        sendJson(response, 200, channelConfig);
        return;
      }

      if (request.method === "GET" && pathname === "/api/plugins/config") {
        const pluginConfig = await pluginService.getConfigOverview();
        eventPublisher.publishPluginConfigUpdated(pluginConfig);
        sendJson(response, 200, pluginConfig);
        return;
      }

      if (request.method === "GET" && pathname === "/api/skills/config") {
        const skillConfig = await skillService.getConfigOverview();
        eventPublisher.publishSkillCatalogUpdated(skillConfig);
        sendJson(response, 200, skillConfig);
        return;
      }

      if (request.method === "GET" && pathname === "/api/skills/marketplace/explore") {
        sendJson(response, 200, await adapter.config.exploreSkillMarketplace(10));
        return;
      }

      if (request.method === "GET" && pathname === "/api/skills/marketplace/search") {
        sendJson(response, 200, await skillService.searchMarketplace(requestUrl.searchParams.get("q") ?? ""));
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/api/skills/marketplace/")) {
        const slug = decodeURIComponent(pathname.slice("/api/skills/marketplace/".length));
        sendJson(response, 200, await skillService.getMarketplaceDetail(slug));
        return;
      }

      if (request.method === "POST" && request.url === "/api/skills/install") {
        const body = await readJson<InstallSkillRequest>(request);
        sendJson(response, 200, await skillService.installMarketplaceSkill(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/skills/custom") {
        const body = await readJson<SaveCustomSkillRequest>(request);
        sendJson(response, 200, await skillService.saveCustomSkill(undefined, body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/skills/preset-sync/repair") {
        sendJson(response, 200, await skillService.repairPresetSkillSync());
        return;
      }

      if (request.method === "GET" && pathname === "/api/ai-team/overview") {
        const overview = await aiTeamService.getOverview();
        eventPublisher.publishAITeamUpdated(overview);
        sendJson(response, 200, overview);
        return;
      }

      if (request.method === "GET" && pathname === "/api/chat/overview") {
        sendJson(response, 200, await chatService.getOverview());
        return;
      }

      if (request.method === "POST" && request.url === "/api/chat/threads") {
        const body = await readJson<CreateChatThreadRequest>(request);
        sendJson(response, 200, await chatService.createThread(body));
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/api/chat/threads/")) {
        const threadId = decodeURIComponent(pathname.slice("/api/chat/threads/".length));
        sendJson(response, 200, await chatService.getThreadDetail(threadId));
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/chat/threads/") && request.url.endsWith("/messages")) {
        const threadId = decodeURIComponent(request.url.slice("/api/chat/threads/".length, -"/messages".length));
        const body = await readJson<SendChatMessageRequest>(request);
        sendJson(response, 200, await chatService.sendMessage(threadId, body));
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/chat/threads/") && request.url.endsWith("/abort")) {
        const threadId = decodeURIComponent(request.url.slice("/api/chat/threads/".length, -"/abort".length));
        const body = await readJson<AbortChatRequest>(request);
        sendJson(response, 200, await chatService.abortThread(threadId, body));
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/api/skills/")) {
        const skillId = decodeURIComponent(pathname.slice("/api/skills/".length));
        sendJson(response, 200, await skillService.getInstalledSkillDetail(skillId));
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/api/ai-members/") && pathname.endsWith("/bindings")) {
        const memberId = decodeURIComponent(pathname.slice("/api/ai-members/".length, -"/bindings".length));
        sendJson(response, 200, await aiTeamService.getMemberBindings(memberId));
        return;
      }

      if (request.method === "POST" && request.url === "/api/ai-members") {
        const body = await readJson<SaveAIMemberRequest>(request);
        sendJson(response, 200, await aiTeamService.saveMember(undefined, body));
        return;
      }

      if (request.method === "PATCH" && request.url.startsWith("/api/ai-members/")) {
        const memberId = request.url.slice("/api/ai-members/".length);
        const body = await readJson<SaveAIMemberRequest>(request);
        sendJson(response, 200, await aiTeamService.saveMember(memberId, body));
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/ai-members/") && request.url.endsWith("/bindings")) {
        const memberId = request.url.slice("/api/ai-members/".length, -"/bindings".length);
        const body = await readJson<BindAIMemberChannelRequest>(request);
        sendJson(response, 200, await aiTeamService.bindMemberChannel(memberId, body));
        return;
      }

      if (request.method === "DELETE" && request.url.startsWith("/api/ai-members/") && request.url.endsWith("/bindings")) {
        const memberId = request.url.slice("/api/ai-members/".length, -"/bindings".length);
        const body = await readJson<BindAIMemberChannelRequest>(request);
        sendJson(response, 200, await aiTeamService.unbindMemberChannel(memberId, body));
        return;
      }

      if (request.method === "DELETE" && request.url.startsWith("/api/ai-members/")) {
        const memberId = request.url.slice("/api/ai-members/".length);
        const body = await readJson<DeleteAIMemberRequest>(request);
        sendJson(response, 200, await aiTeamService.deleteMember(memberId, body));
        return;
      }

      if (request.method === "PATCH" && request.url.startsWith("/api/skills/")) {
        const skillId = decodeURIComponent(request.url.slice("/api/skills/".length));
        const body = await readJson<UpdateSkillRequest>(request);
        sendJson(response, 200, await skillService.updateSkill(skillId, body));
        return;
      }

      if (request.method === "DELETE" && request.url.startsWith("/api/skills/")) {
        const skillId = decodeURIComponent(request.url.slice("/api/skills/".length));
        const body = await readJson<RemoveSkillRequest>(request);
        sendJson(response, 200, await skillService.removeSkill(skillId, body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/teams") {
        const body = await readJson<SaveTeamRequest>(request);
        sendJson(response, 200, await aiTeamService.saveTeam(undefined, body));
        return;
      }

      if (request.method === "PATCH" && request.url.startsWith("/api/teams/")) {
        const teamId = request.url.slice("/api/teams/".length);
        const body = await readJson<SaveTeamRequest>(request);
        sendJson(response, 200, await aiTeamService.saveTeam(teamId, body));
        return;
      }

      if (request.method === "DELETE" && request.url.startsWith("/api/teams/")) {
        const teamId = request.url.slice("/api/teams/".length);
        sendJson(response, 200, await aiTeamService.deleteTeam(teamId));
        return;
      }

      if (request.method === "POST" && request.url === "/api/channels/entries") {
        const body = await readJson<SaveChannelEntryRequest>(request);
        sendJson(response, 200, await channelSetupService.saveEntry(undefined, body));
        return;
      }

      if (request.method === "PATCH" && request.url.startsWith("/api/channels/entries/")) {
        const entryId = request.url.slice("/api/channels/entries/".length);
        const body = await readJson<SaveChannelEntryRequest>(request);
        sendJson(response, 200, await channelSetupService.saveEntry(entryId, body));
        return;
      }

      if (request.method === "DELETE" && request.url.startsWith("/api/channels/entries/")) {
        const entryId = request.url.slice("/api/channels/entries/".length);
        const body = await readJson<RemoveChannelEntryRequest>(request);
        sendJson(response, 200, await channelSetupService.removeEntry({ ...body, entryId }));
        return;
      }

      if (request.method === "POST" && pathname.startsWith("/api/plugins/") && pathname.endsWith("/install")) {
        const pluginId = decodeURIComponent(pathname.slice("/api/plugins/".length, -"/install".length));
        sendJson(response, 200, await pluginService.installPlugin(pluginId));
        return;
      }

      if (request.method === "POST" && pathname.startsWith("/api/plugins/") && pathname.endsWith("/update")) {
        const pluginId = decodeURIComponent(pathname.slice("/api/plugins/".length, -"/update".length));
        sendJson(response, 200, await pluginService.updatePlugin(pluginId));
        return;
      }

      if (request.method === "DELETE" && pathname.startsWith("/api/plugins/")) {
        const pluginId = decodeURIComponent(pathname.slice("/api/plugins/".length));
        sendJson(response, 200, await pluginService.removePlugin(pluginId));
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/api/channels/session/")) {
        const sessionId = pathname.slice("/api/channels/session/".length);
        sendJson(response, 200, await channelSetupService.getSession(sessionId));
        return;
      }

      if (request.method === "POST" && request.url.startsWith("/api/channels/session/") && request.url.endsWith("/input")) {
        const sessionId = request.url.slice("/api/channels/session/".length, -"/input".length);
        const body = await readJson<ChannelSessionInputRequest>(request);
        sendJson(response, 200, await channelSetupService.submitSessionInput(sessionId, body));
        return;
      }

      if ((request.method === "GET" || request.method === "POST") && pathname.startsWith("/api/channels/feishu/callback")) {
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

      if (request.method === "POST" && request.url === "/api/tasks") {
        const body = await readJson<EngineTaskRequest>(request);
        sendJson(response, 200, await taskService.runTask(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/update") {
        sendJson(response, 200, await adapter.instances.update());
        return;
      }

      if (request.method === "GET" && pathname === "/api/service/status") {
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

      if (request.method === "GET" && pathname === "/api/diagnostics") {
        const bundle = await adapter.instances.exportDiagnostics();
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
          result: await adapter.instances.repair(action),
          overview: await overviewService.getOverview()
        });
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

  server.on("error", (error) => {
    void writeErrorLog("SlackClaw daemon server emitted an error.", errorToLogDetails(error));
  });

  server.on("clientError", (error, socket) => {
    void writeErrorLog("SlackClaw daemon rejected a malformed client connection.", errorToLogDetails(error));
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
  void writeInfoLog("SlackClaw daemon server started.", {
    port,
    appVersion: "0.1.2"
  });

  return server;
}
