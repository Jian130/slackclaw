import type {
  AppControlResponse,
  AppServiceActionResponse,
  ChannelActionResponse,
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  EngineTaskRequest,
  EngineTaskResult,
  InstallResponse,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  ModelConfigOverview,
  OnboardingSelection,
  PairingApprovalRequest,
  ProductOverview,
  ReplaceFallbackModelEntriesRequest,
  RecoveryRunResponse
} from "@slackclaw/contracts";
import type {
  FeishuSetupRequest,
  SaveModelEntryRequest,
  SetDefaultModelRequest,
  SetDefaultModelEntryRequest,
  SetupRunResponse,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@slackclaw/contracts";

const API_BASE =
  typeof window !== "undefined" && window.location.origin.includes("127.0.0.1:4545")
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:4545/api";

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
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

export function fetchOverview(): Promise<ProductOverview> {
  return readJson<ProductOverview>("/overview");
}

export function fetchDeploymentTargets(): Promise<DeploymentTargetsResponse> {
  return readJson<DeploymentTargetsResponse>("/deploy/targets");
}

export function updateDeploymentTarget(
  targetId: "standard" | "managed-local"
): Promise<DeploymentTargetActionResponse> {
  return readJson<DeploymentTargetActionResponse>(`/deploy/targets/${targetId}/update`, {
    method: "POST"
  });
}

export function markFirstRunIntroComplete(): Promise<ProductOverview> {
  return readJson<ProductOverview>("/first-run/intro", {
    method: "POST"
  });
}

export function fetchModelConfig(): Promise<ModelConfigOverview> {
  return readJson<ModelConfigOverview>("/models/config");
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

export function completeOnboarding(selection: OnboardingSelection): Promise<ProductOverview> {
  return readJson<ProductOverview>("/onboarding", {
    method: "POST",
    body: JSON.stringify(selection)
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
