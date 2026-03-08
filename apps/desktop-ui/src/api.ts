import type {
  AppServiceActionResponse,
  EngineTaskRequest,
  EngineTaskResult,
  InstallResponse,
  OnboardingSelection,
  ProductOverview,
  RecoveryRunResponse
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
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchOverview(): Promise<ProductOverview> {
  return readJson<ProductOverview>("/overview");
}

export function installSlackClaw(autoConfigure = true): Promise<{ install: InstallResponse; overview: ProductOverview }> {
  return readJson<{ install: InstallResponse; overview: ProductOverview }>("/install", {
    method: "POST",
    body: JSON.stringify({ autoConfigure })
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
