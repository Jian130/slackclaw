import type {
  AbortChatRequest,
  AITeamActionResponse,
  AITeamOverview,
  AppControlResponse,
  AppServiceActionResponse,
  BindAIMemberChannelRequest,
  ChatActionResponse,
  ChatOverview,
  ChatThreadDetail,
  DeleteAIMemberRequest,
  ChannelActionResponse,
  ChannelConfigActionResponse,
  ChannelConfigOverview,
  ChannelSessionInputRequest,
  ChannelSessionResponse,
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  EngineTaskRequest,
  EngineTaskResult,
  GatewayActionResponse,
  InstallResponse,
  InstallSkillRequest,
  InstalledSkillDetail,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  ModelConfigOverview,
  MemberBindingsResponse,
  PairingApprovalRequest,
  ProductOverview,
  OnboardingStateResponse,
  RemoveSkillRequest,
  RemoveChannelEntryRequest,
  ReplaceFallbackModelEntriesRequest,
  RecoveryRunResponse,
  SaveCustomSkillRequest,
  SendChatMessageRequest,
  SkillCatalogActionResponse,
  SkillCatalogOverview,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
  UpdateSkillRequest
} from "@slackclaw/contracts";
import type {
  CreateChatThreadRequest,
  FeishuSetupRequest,
  SaveAIMemberRequest,
  SaveChannelEntryRequest,
  SaveModelEntryRequest,
  SaveTeamRequest,
  SetDefaultModelRequest,
  SetDefaultModelEntryRequest,
  SetupRunResponse,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";

export function resolveApiBase() {
  return typeof window !== "undefined" && window.location.origin.includes("127.0.0.1:4545")
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:4545/api";
}

const API_BASE = resolveApiBase();

const inflightGetRequests = new Map<string, Promise<unknown>>();
const responseGetCache = new Map<string, { expiresAt: number; value: unknown }>();
const DEFAULT_GET_CACHE_MS = 2000;

type JsonRequestInit = RequestInit & {
  fresh?: boolean;
};

function getGetCacheMs(path: string): number | undefined {
  if (
    path.startsWith("/overview") ||
    path.startsWith("/onboarding/state") ||
    path.startsWith("/deploy/targets") ||
    path.startsWith("/models/config") ||
    path.startsWith("/channels/config") ||
    path.startsWith("/skills/config") ||
    path.startsWith("/ai-team/overview") ||
    path.startsWith("/chat/overview")
  ) {
    return DEFAULT_GET_CACHE_MS;
  }

  return undefined;
}

function invalidateGetCache() {
  responseGetCache.clear();
}

export function resetClientReadStateForTests() {
  inflightGetRequests.clear();
  invalidateGetCache();
}

function buildApiPath(path: string, fresh?: boolean): string {
  if (!fresh) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}fresh=1`;
}

async function performJsonRequest<T>(path: string, init?: JsonRequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Keep status message fallback.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function readJson<T>(path: string, init?: JsonRequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const requestPath = buildApiPath(path, init?.fresh);
  const nextInit = { ...init };
  delete nextInit.fresh;

  if (method !== "GET") {
    const result = await performJsonRequest<T>(requestPath, nextInit);
    invalidateGetCache();
    return result;
  }

  const cacheKey = `${method}:${requestPath}`;
  const ttlMs = getGetCacheMs(path);
  const cached = !init?.fresh && ttlMs ? responseGetCache.get(cacheKey) : undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const existing = inflightGetRequests.get(cacheKey);

  if (existing) {
    return existing as Promise<T>;
  }

  const cachedPromise = performJsonRequest<T>(requestPath, nextInit)
    .then((value) => {
    if (ttlMs) {
      responseGetCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + ttlMs
      });
    }

    return value;
    })
    .finally(() => {
      if (inflightGetRequests.get(cacheKey) === cachedPromise) {
        inflightGetRequests.delete(cacheKey);
      }
    });

  inflightGetRequests.set(cacheKey, cachedPromise);
  return cachedPromise;
}

export function fetchOverview(options?: { fresh?: boolean }): Promise<ProductOverview> {
  return readJson<ProductOverview>("/overview", options);
}

export function fetchDeploymentTargets(options?: { fresh?: boolean }): Promise<DeploymentTargetsResponse> {
  return readJson<DeploymentTargetsResponse>("/deploy/targets", options);
}

export function installDeploymentTarget(
  targetId: "standard" | "managed-local"
): Promise<DeploymentTargetActionResponse> {
  return readJson<DeploymentTargetActionResponse>(`/deploy/targets/${targetId}/install`, {
    method: "POST"
  });
}

export function updateDeploymentTarget(
  targetId: "standard" | "managed-local"
): Promise<DeploymentTargetActionResponse> {
  return readJson<DeploymentTargetActionResponse>(`/deploy/targets/${targetId}/update`, {
    method: "POST"
  });
}

export function uninstallDeploymentTarget(
  targetId: "standard" | "managed-local"
): Promise<DeploymentTargetActionResponse> {
  return readJson<DeploymentTargetActionResponse>(`/deploy/targets/${targetId}/uninstall`, {
    method: "POST"
  });
}

export function restartGateway(): Promise<GatewayActionResponse> {
  return readJson<GatewayActionResponse>("/deploy/gateway/restart", {
    method: "POST"
  });
}

export function markFirstRunIntroComplete(): Promise<ProductOverview> {
  return readJson<ProductOverview>("/first-run/intro", {
    method: "POST"
  });
}

export function fetchOnboardingState(options?: { fresh?: boolean }): Promise<OnboardingStateResponse> {
  return readJson<OnboardingStateResponse>("/onboarding/state", options);
}

export function updateOnboardingState(request: Partial<OnboardingStateResponse["draft"]>): Promise<OnboardingStateResponse> {
  return readJson<OnboardingStateResponse>("/onboarding/state", {
    method: "PATCH",
    body: JSON.stringify(request)
  });
}

export function completeOnboarding(request: CompleteOnboardingRequest): Promise<CompleteOnboardingResponse> {
  return readJson<CompleteOnboardingResponse>("/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function redoOnboarding(): Promise<OnboardingStateResponse> {
  return readJson<OnboardingStateResponse>("/onboarding/reset", {
    method: "POST"
  });
}

export function fetchModelConfig(options?: { fresh?: boolean }): Promise<ModelConfigOverview> {
  return readJson<ModelConfigOverview>("/models/config", options);
}

export function createSavedModelEntry(request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>("/models/entries", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>(`/models/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(request)
  });
}

export function removeSavedModelEntry(entryId: string): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>(`/models/entries/${entryId}`, {
    method: "DELETE"
  });
}

export function setDefaultModelEntry(request: SetDefaultModelEntryRequest): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>("/models/default-entry", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>("/models/fallbacks", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function authenticateModelProvider(request: ModelAuthRequest): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>("/models/auth", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function fetchModelAuthSession(sessionId: string): Promise<ModelAuthSessionResponse> {
  return readJson<ModelAuthSessionResponse>(`/models/auth/session/${sessionId}`);
}

export function submitModelAuthSessionInput(
  sessionId: string,
  request: ModelAuthSessionInputRequest
): Promise<ModelAuthSessionResponse> {
  return readJson<ModelAuthSessionResponse>(`/models/auth/session/${sessionId}/input`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function setDefaultModel(request: SetDefaultModelRequest): Promise<ModelConfigActionResponse> {
  return readJson<ModelConfigActionResponse>("/models/default", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function runFirstRunSetup(forceLocal = false): Promise<SetupRunResponse> {
  return readJson<SetupRunResponse>("/first-run/setup", {
    method: "POST",
    body: JSON.stringify({ autoConfigure: true, forceLocal })
  });
}

export function installSlackClaw(
  autoConfigure = false,
  forceLocal = false
): Promise<{ install: InstallResponse; overview: ProductOverview }> {
  return readJson<{ install: InstallResponse; overview: ProductOverview }>("/install", {
    method: "POST",
    body: JSON.stringify({ autoConfigure, forceLocal })
  });
}

export function uninstallEngine(): Promise<{ result: EngineActionResponse; overview: ProductOverview }> {
  return readJson<{ result: EngineActionResponse; overview: ProductOverview }>("/engine/uninstall", {
    method: "POST"
  });
}

export function fetchChannelConfig(options?: { fresh?: boolean }): Promise<ChannelConfigOverview> {
  return readJson<ChannelConfigOverview>("/channels/config", options);
}

export function fetchSkillConfig(options?: { fresh?: boolean }): Promise<SkillCatalogOverview> {
  return readJson<SkillCatalogOverview>("/skills/config", options);
}

export function fetchMarketplacePreview(): Promise<SkillMarketplaceEntry[]> {
  return readJson<SkillMarketplaceEntry[]>("/skills/marketplace/explore");
}

export function searchMarketplaceSkills(query: string): Promise<SkillMarketplaceEntry[]> {
  return readJson<SkillMarketplaceEntry[]>(`/skills/marketplace/search?q=${encodeURIComponent(query)}`);
}

export function fetchMarketplaceSkillDetail(slug: string): Promise<SkillMarketplaceDetail> {
  return readJson<SkillMarketplaceDetail>(`/skills/marketplace/${encodeURIComponent(slug)}`);
}

export function installMarketplaceSkill(request: InstallSkillRequest): Promise<SkillCatalogActionResponse> {
  return readJson<SkillCatalogActionResponse>("/skills/install", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createCustomSkill(request: SaveCustomSkillRequest): Promise<SkillCatalogActionResponse> {
  return readJson<SkillCatalogActionResponse>("/skills/custom", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function fetchInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail> {
  return readJson<InstalledSkillDetail>(`/skills/${encodeURIComponent(skillId)}`);
}

export function updateSkill(skillId: string, request: UpdateSkillRequest): Promise<SkillCatalogActionResponse> {
  return readJson<SkillCatalogActionResponse>(`/skills/${encodeURIComponent(skillId)}`, {
    method: "PATCH",
    body: JSON.stringify(request)
  });
}

export function removeSkill(skillId: string, request: RemoveSkillRequest = {}): Promise<SkillCatalogActionResponse> {
  return readJson<SkillCatalogActionResponse>(`/skills/${encodeURIComponent(skillId)}`, {
    method: "DELETE",
    body: JSON.stringify(request)
  });
}

export function fetchAITeamOverview(options?: { fresh?: boolean }): Promise<AITeamOverview> {
  return readJson<AITeamOverview>("/ai-team/overview", options);
}

export function fetchAIMemberBindings(memberId: string, options?: { fresh?: boolean }): Promise<MemberBindingsResponse> {
  return readJson<MemberBindingsResponse>(`/ai-members/${encodeURIComponent(memberId)}/bindings`, options);
}

export function fetchChatOverview(): Promise<ChatOverview> {
  return readJson<ChatOverview>("/chat/overview");
}

export function createChatThread(request: CreateChatThreadRequest): Promise<ChatActionResponse> {
  return readJson<ChatActionResponse>("/chat/threads", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function fetchChatThread(threadId: string): Promise<ChatThreadDetail> {
  return readJson<ChatThreadDetail>(`/chat/threads/${encodeURIComponent(threadId)}`);
}

export function sendChatMessage(threadId: string, request: SendChatMessageRequest): Promise<ChatActionResponse> {
  return readJson<ChatActionResponse>(`/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function abortChatThread(threadId: string, request: AbortChatRequest = {}): Promise<ChatActionResponse> {
  return readJson<ChatActionResponse>(`/chat/threads/${encodeURIComponent(threadId)}/abort`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createAIMember(request: SaveAIMemberRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>("/ai-members", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function updateAIMember(memberId: string, request: SaveAIMemberRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>(`/ai-members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(request)
  });
}

export function deleteAIMember(memberId: string, request: DeleteAIMemberRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>(`/ai-members/${memberId}`, {
    method: "DELETE",
    body: JSON.stringify(request)
  });
}

export function bindAIMemberChannel(memberId: string, request: BindAIMemberChannelRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>(`/ai-members/${memberId}/bindings`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function unbindAIMemberChannel(memberId: string, request: BindAIMemberChannelRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>(`/ai-members/${memberId}/bindings`, {
    method: "DELETE",
    body: JSON.stringify(request)
  });
}

export function createTeam(request: SaveTeamRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>("/teams", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function updateTeam(teamId: string, request: SaveTeamRequest): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>(`/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(request)
  });
}

export function deleteTeam(teamId: string): Promise<AITeamActionResponse> {
  return readJson<AITeamActionResponse>(`/teams/${teamId}`, {
    method: "DELETE"
  });
}

export function createChannelEntry(request: SaveChannelEntryRequest): Promise<ChannelConfigActionResponse> {
  return readJson<ChannelConfigActionResponse>("/channels/entries", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function updateChannelEntry(entryId: string, request: SaveChannelEntryRequest): Promise<ChannelConfigActionResponse> {
  return readJson<ChannelConfigActionResponse>(`/channels/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(request)
  });
}

export function removeChannelEntry(entryId: string, request: RemoveChannelEntryRequest = { entryId }): Promise<ChannelConfigActionResponse> {
  return readJson<ChannelConfigActionResponse>(`/channels/entries/${entryId}`, {
    method: "DELETE",
    body: JSON.stringify(request)
  });
}

export function fetchChannelSession(sessionId: string): Promise<ChannelSessionResponse> {
  return readJson<ChannelSessionResponse>(`/channels/session/${sessionId}`);
}

export function submitChannelSessionInput(
  sessionId: string,
  request: ChannelSessionInputRequest
): Promise<ChannelSessionResponse> {
  return readJson<ChannelSessionResponse>(`/channels/session/${sessionId}/input`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
  return readJson<EngineTaskResult>("/tasks", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function runRecovery(actionId: string): Promise<{ result: RecoveryRunResponse; overview: ProductOverview }> {
  return readJson<{ result: RecoveryRunResponse; overview: ProductOverview }>(`/recovery/${actionId}`, {
    method: "POST"
  });
}

export function runUpdate(): Promise<{ message: string }> {
  return readJson<{ message: string }>("/update", {
    method: "POST"
  });
}

export function exportDiagnostics(): Promise<{ message: string; path: string }> {
  return readJson<{ message: string; path: string }>("/diagnostics");
}

export function installAppService(): Promise<{ result: AppServiceActionResponse; overview: ProductOverview }> {
  return readJson<{ result: AppServiceActionResponse; overview: ProductOverview }>("/service/install", {
    method: "POST"
  });
}

export function restartAppService(): Promise<{ result: AppServiceActionResponse; overview: ProductOverview }> {
  return readJson<{ result: AppServiceActionResponse; overview: ProductOverview }>("/service/restart", {
    method: "POST"
  });
}

export function uninstallAppService(): Promise<{ result: AppServiceActionResponse; overview: ProductOverview }> {
  return readJson<{ result: AppServiceActionResponse; overview: ProductOverview }>("/service/uninstall", {
    method: "POST"
  });
}

export function stopSlackClawApp(): Promise<AppControlResponse> {
  return readJson<AppControlResponse>("/app/stop", {
    method: "POST"
  });
}

export function uninstallSlackClawApp(): Promise<AppControlResponse> {
  return readJson<AppControlResponse>("/app/uninstall", {
    method: "POST"
  });
}

export function setupTelegramChannel(request: TelegramSetupRequest): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/telegram", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function approveTelegramPairing(request: PairingApprovalRequest): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/telegram/approve", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function startWhatsappLogin(): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/whatsapp/login", {
    method: "POST"
  });
}

export function approveWhatsappPairing(request: PairingApprovalRequest): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/whatsapp/approve", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function setupWechatWorkaround(request: WechatSetupRequest): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/wechat", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function setupFeishuChannel(request: FeishuSetupRequest): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/feishu", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function prepareFeishuChannel(): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/feishu/prepare", {
    method: "POST"
  });
}

export function approveFeishuPairing(request: PairingApprovalRequest): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/feishu/approve", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function startGatewayAfterChannels(): Promise<ChannelActionResponse> {
  return readJson<ChannelActionResponse>("/channels/gateway/start", {
    method: "POST"
  });
}
