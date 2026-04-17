import { spawn } from "node:child_process";
import { homedir, totalmem } from "node:os";
import { stat } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

import type {
  GatewayActionResponse,
  LocalModelRuntimeAction,
  LocalModelRuntimeOverview,
  LocalModelRuntimePhase,
  LocalModelRuntimeStatus,
  ModelConfigActionResponse,
  ModelConfigOverview
} from "@chillclaw/contracts";

import {
  chooseLocalModelTier,
  minimumLocalModelMemoryGb,
  type LocalModelHostSnapshot
} from "../config/local-model-runtime-catalog.js";
import type { ManagedLocalModelEntryRequest } from "../engine/adapter.js";
import { getManagedOllamaCliPath, getManagedOllamaDir, getManagedOllamaModelsDir } from "../runtime-paths.js";
import { getAvailableDiskBytes } from "../platform/disk-space.js";
import { runCommand } from "../platform/cli-runner.js";
import { logDevelopmentCommand, writeInfoLog } from "./logger.js";
import { StateStore } from "./state-store.js";
import type { EventPublisher } from "./event-publisher.js";
import type { EngineAdapter } from "../engine/adapter.js";
import type { RuntimeManager } from "../runtime-manager/runtime-manager.js";
import type { DownloadManager } from "../download-manager/download-manager.js";

export type ResolvedOllamaRuntime = {
  command: string;
  source: "managed-install" | "existing-install";
  managed: boolean;
};

export type PersistedLocalModelRuntimeState = {
  managedEntryId?: string;
  selectedModelKey?: string;
  status?: LocalModelRuntimeStatus;
  lastError?: string;
  activeAction?: LocalModelRuntimeAction;
  activePhase?: LocalModelRuntimePhase;
  progressMessage?: string;
  progressDigest?: string;
  progressCompletedBytes?: number;
  progressTotalBytes?: number;
  progressPercent?: number;
  lastProgressAt?: string;
  downloadJobId?: string;
};

export type LocalModelRuntimeResult = {
  status: "completed" | "failed";
  message: string;
  localRuntime: LocalModelRuntimeOverview;
};

export type PullModelProgress = {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  downloadJobId?: string;
};

export type LocalModelRuntimeAccess = {
  inspectHost: () => Promise<LocalModelHostSnapshot>;
  readPersistedState: () => Promise<PersistedLocalModelRuntimeState | undefined>;
  writePersistedState: (nextState: PersistedLocalModelRuntimeState) => Promise<void>;
  fetchModelSelection: () => Promise<Pick<ModelConfigOverview, "savedEntries" | "defaultEntryId" | "defaultModel">>;
  resolveInstalledRuntime: () => Promise<ResolvedOllamaRuntime | undefined>;
  installManagedRuntime: () => Promise<ResolvedOllamaRuntime>;
  prepareRuntimeEndpoint: (runtime: ResolvedOllamaRuntime) => Promise<void>;
  isRuntimeReachable: (runtime: ResolvedOllamaRuntime | undefined) => Promise<boolean>;
  startRuntime: (runtime: ResolvedOllamaRuntime) => Promise<void>;
  isModelAvailable: (runtime: ResolvedOllamaRuntime, modelTag: string) => Promise<boolean>;
  pullModel: (runtime: ResolvedOllamaRuntime, modelTag: string, publishProgress: (progress: PullModelProgress) => void | Promise<void>) => Promise<void>;
  upsertManagedLocalModelEntry: (request: ManagedLocalModelEntryRequest) => Promise<ModelConfigActionResponse>;
  restartGateway: () => Promise<GatewayActionResponse>;
  publishProgress: (
    action: LocalModelRuntimeAction,
    phase: LocalModelRuntimePhase,
    message: string,
    localRuntime: LocalModelRuntimeOverview,
    percent?: number
  ) => void;
  publishCompleted: (
    action: LocalModelRuntimeAction,
    status: "completed" | "failed",
    message: string,
    localRuntime: LocalModelRuntimeOverview
  ) => void;
};

type ActiveLocalModelRuntimeJob = {
  action: LocalModelRuntimeAction;
  promise: Promise<LocalModelRuntimeResult>;
};

type RetryableError = Error & { retryable?: boolean };

const LOCAL_MODEL_PULL_MAX_ATTEMPTS = 3;
const LOCAL_MODEL_COMMAND_TIMEOUT_MS = 30_000;
const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11_434;
const OLLAMA_BASE_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

export { resolveDiskProbePath } from "../platform/disk-space.js";

function modelTagFromKey(modelKey: string): string {
  return modelKey.replace(/^ollama\//, "");
}

function createRetryableError(message: string, retryable: boolean): RetryableError {
  const error = new Error(message) as RetryableError;
  error.retryable = retryable;
  return error;
}

function isRetryableError(error: unknown): error is RetryableError {
  return Boolean((error as RetryableError | undefined)?.retryable);
}

function trimProgressMessage(message: string | undefined, fallback: string): string {
  const trimmed = message?.trim();
  return trimmed?.length ? trimmed : fallback;
}

function describePullProgress(progress: PullModelProgress): string {
  switch (progress.status) {
    case "pulling manifest":
      return "Checking the local model manifest.";
    case "verifying sha256 digest":
      return "Verifying the downloaded local model.";
    case "writing manifest":
      return "Writing the local model manifest.";
    case "removing any unused layers":
      return "Cleaning up unused local model layers.";
    case "success":
      return "Local model download complete.";
    default:
      if (progress.digest) {
        return `Downloading local model layer ${progress.digest.slice(0, 12)}.`;
      }
      return trimProgressMessage(progress.status, "Downloading the local model.");
  }
}

function progressPercentForPull(progress: PullModelProgress): number | undefined {
  if (progress.status === "success") {
    return 100;
  }

  return undefined;
}

function activeLocalEntry(modelSelection: Pick<ModelConfigOverview, "savedEntries" | "defaultEntryId" | "defaultModel">) {
  const defaultModel = modelSelection.defaultModel?.trim();
  const defaultModelEntry = defaultModel
    ? modelSelection.savedEntries.find((entry) => entry.modelKey === defaultModel)
    : undefined;
  const defaultEntry = defaultModelEntry ?? (
    defaultModel
      ? undefined
      : modelSelection.savedEntries.find((entry) => entry.id === modelSelection.defaultEntryId)
  );

  return defaultEntry?.providerId === "ollama" || defaultEntry?.modelKey.startsWith("ollama/")
    ? defaultEntry
    : undefined;
}

function inFlightStatus(status: LocalModelRuntimeStatus | undefined): status is Extract<
  LocalModelRuntimeStatus,
  "installing-runtime" | "starting-runtime" | "downloading-model" | "configuring-openclaw"
> {
  return (
    status === "installing-runtime" ||
    status === "starting-runtime" ||
    status === "downloading-model" ||
    status === "configuring-openclaw"
  );
}

function unsupportedOverview(
  host: LocalModelHostSnapshot,
  supportCode: LocalModelRuntimeOverview["supportCode"],
  detail: string
): LocalModelRuntimeOverview {
  return {
    supported: false,
    recommendation: "cloud",
    supportCode,
    status: "cloud-recommended",
    runtimeInstalled: false,
    runtimeReachable: false,
    modelDownloaded: false,
    activeInOpenClaw: false,
    totalMemoryGb: host.totalMemoryGb,
    freeDiskGb: host.freeDiskGb,
    summary: "This Mac is better suited to cloud AI.",
    detail,
    recoveryHint: "Use a cloud model provider instead."
  };
}

function logLocalRuntimeOverview(overview: LocalModelRuntimeOverview): void {
  void writeInfoLog("Local Ollama runtime overview resolved.", {
    supported: overview.supported,
    recommendation: overview.recommendation,
    supportCode: overview.supportCode,
    status: overview.status,
    runtimeInstalled: overview.runtimeInstalled,
    runtimeReachable: overview.runtimeReachable,
    modelDownloaded: overview.modelDownloaded,
    activeInOpenClaw: overview.activeInOpenClaw,
    recommendedTier: overview.recommendedTier,
    chosenModelKey: overview.chosenModelKey,
    totalMemoryGb: overview.totalMemoryGb,
    freeDiskGb: overview.freeDiskGb,
    summary: overview.summary
  }, {
    scope: "LocalModelRuntimeService.getOverview"
  });
}

export class LocalModelRuntimeService {
  private activeJob: ActiveLocalModelRuntimeJob | undefined;

  constructor(private readonly access: LocalModelRuntimeAccess) {}

  async decorateModelConfig(modelConfig: ModelConfigOverview): Promise<ModelConfigOverview> {
    return {
      ...modelConfig,
      localRuntime: await this.getOverview(modelConfig)
    };
  }

  async resumePendingWork(): Promise<void> {
    const persisted = await this.access.readPersistedState();
    if (!inFlightStatus(persisted?.status)) {
      return;
    }

    await this.runAction(persisted?.activeAction ?? "install");
  }

  async getOverview(existingModelConfig?: ModelConfigOverview): Promise<LocalModelRuntimeOverview> {
    const persisted = await this.access.readPersistedState();
    const host = await this.access.inspectHost();

    if (host.platform !== "darwin") {
      const overview = unsupportedOverview(host, "unsupported-platform", `ChillClaw only automates local Ollama setup on macOS right now. This machine reports ${host.platform}.`);
      logLocalRuntimeOverview(overview);
      return overview;
    }

    if (host.architecture !== "arm64") {
      const overview = unsupportedOverview(host, "unsupported-architecture", "Phase 1 local AI automation is limited to Apple Silicon Macs.");
      logLocalRuntimeOverview(overview);
      return overview;
    }

    const recommendedTier = chooseLocalModelTier(host);
    if (!recommendedTier) {
      const minimumMemoryGb = minimumLocalModelMemoryGb();
      const overview = unsupportedOverview(
        host,
        host.totalMemoryGb < minimumMemoryGb ? "insufficient-memory" : "insufficient-disk",
        host.totalMemoryGb < minimumMemoryGb
          ? `ChillClaw recommends at least ${minimumMemoryGb} GB of unified memory for the starter local model.`
          : "ChillClaw recommends more free disk space before downloading a starter local model."
      );
      logLocalRuntimeOverview(overview);
      return overview;
    }

    const modelSelection = existingModelConfig ?? (await this.access.fetchModelSelection());
    const runtime = await this.access.resolveInstalledRuntime();
    const activeEntry = activeLocalEntry(modelSelection);
    const activeDefaultLocalModelKey = modelSelection.defaultModel?.startsWith("ollama/") ? modelSelection.defaultModel : undefined;
    const chosenModelKey = persisted?.selectedModelKey ?? activeEntry?.modelKey ?? activeDefaultLocalModelKey ?? recommendedTier.modelKey;
    const runtimeReachable = runtime ? await this.access.isRuntimeReachable(runtime) : false;
    const modelDownloaded =
      runtime && runtimeReachable && chosenModelKey
        ? await this.access.isModelAvailable(runtime, modelTagFromKey(chosenModelKey))
        : false;
    const activeInOpenClaw = Boolean(activeEntry || activeDefaultLocalModelKey);

    let status: LocalModelRuntimeStatus = "idle";
    if (inFlightStatus(persisted?.status)) {
      status = persisted?.status;
    } else if (persisted?.status === "failed") {
      status = "failed";
    } else if (activeInOpenClaw && (!runtimeReachable || !modelDownloaded)) {
      status = "degraded";
    } else if (activeInOpenClaw && runtimeReachable && modelDownloaded) {
      status = "ready";
    } else if (runtime && !runtimeReachable) {
      status = "degraded";
    }

    let summary = "Local AI is available on this Mac.";
    let detail = `ChillClaw recommends the ${recommendedTier.id} Ollama starter tier for this Apple Silicon Mac.`;

    if (status === "installing-runtime") {
      summary = "Local AI setup is preparing.";
      detail = trimProgressMessage(persisted?.progressMessage, "ChillClaw is checking the local Ollama runtime.");
    } else if (status === "starting-runtime") {
      summary = "Local AI is starting.";
      detail = trimProgressMessage(persisted?.progressMessage, "ChillClaw is starting the local Ollama runtime.");
    } else if (status === "downloading-model") {
      summary = "Local AI is downloading.";
      detail = trimProgressMessage(persisted?.progressMessage, "ChillClaw is downloading the starter local model.");
    } else if (status === "configuring-openclaw") {
      summary = "Local AI is connecting to OpenClaw.";
      detail = trimProgressMessage(persisted?.progressMessage, "ChillClaw is connecting OpenClaw to the local Ollama runtime.");
    } else if (status === "ready") {
      summary = "Local AI is ready on this Mac.";
      detail = "ChillClaw connected OpenClaw directly to the local Ollama runtime.";
    } else if (status === "degraded") {
      summary = "Local AI needs repair.";
      detail = activeInOpenClaw
        ? "OpenClaw is pointed at the local Ollama model, but the local runtime is unavailable or missing its model."
        : "ChillClaw found a local Ollama install, but it is not reachable yet.";
    } else if (status === "failed") {
      summary = "Local AI setup did not finish.";
      detail = persisted?.lastError ?? "ChillClaw could not finish the local Ollama setup.";
    }

    const overview: LocalModelRuntimeOverview = {
      supported: true,
      recommendation: "local",
      supportCode: "supported",
      status,
      runtimeInstalled: Boolean(runtime),
      runtimeReachable,
      modelDownloaded,
      activeInOpenClaw,
      recommendedTier: recommendedTier.id,
      requiredDiskGb: recommendedTier.requiredDiskGb,
      totalMemoryGb: host.totalMemoryGb,
      freeDiskGb: host.freeDiskGb,
      chosenModelKey,
      managedEntryId: persisted?.managedEntryId ?? activeEntry?.id,
      summary,
      detail,
      lastError: persisted?.lastError,
      activeAction: persisted?.activeAction,
      activePhase: persisted?.activePhase,
      progressMessage: persisted?.progressMessage,
      progressDigest: persisted?.progressDigest,
      progressCompletedBytes: persisted?.progressCompletedBytes,
      progressTotalBytes: persisted?.progressTotalBytes,
      progressPercent: persisted?.progressPercent,
      lastProgressAt: persisted?.lastProgressAt,
      downloadJobId: persisted?.downloadJobId,
      recoveryHint: status === "degraded" || status === "failed" ? "Repair the local Ollama runtime or switch back to a cloud model." : undefined
    };
    logLocalRuntimeOverview(overview);
    return overview;
  }

  async install(): Promise<LocalModelRuntimeResult> {
    return this.runAction("install");
  }

  async repair(): Promise<LocalModelRuntimeResult> {
    return this.runAction("repair");
  }

  private async runAction(action: LocalModelRuntimeAction): Promise<LocalModelRuntimeResult> {
    if (this.activeJob) {
      return this.activeJob.promise;
    }

    const promise = this.executeAction(action).finally(() => {
      if (this.activeJob?.promise === promise) {
        this.activeJob = undefined;
      }
    });
    this.activeJob = {
      action,
      promise
    };
    return promise;
  }

  private async executeAction(action: LocalModelRuntimeAction): Promise<LocalModelRuntimeResult> {
    const before = await this.getOverview();
    if (!before.supported || before.recommendation === "cloud") {
      const failed = {
        ...before,
        status: "cloud-recommended" as const
      };
      await this.access.writePersistedState({
        ...(await this.access.readPersistedState()),
        status: failed.status,
        lastError: failed.detail
      });
      this.access.publishCompleted(action, "failed", failed.summary, failed);
      return {
        status: "failed",
        message: failed.summary,
        localRuntime: failed
      };
    }

    try {
      await this.setProgressState(action, "installing-runtime", "ChillClaw is checking the local Ollama runtime.");
      let runtime = await this.access.resolveInstalledRuntime();
      if (!runtime) {
        runtime = await this.access.installManagedRuntime();
      }
      await this.access.prepareRuntimeEndpoint(runtime);

      if (!(await this.access.isRuntimeReachable(runtime))) {
        await this.setProgressState(action, "starting-runtime", "ChillClaw is starting the local Ollama runtime.");
        await this.access.startRuntime(runtime);
      }

      const persisted = await this.access.readPersistedState();
      const targetModelKey = persisted?.selectedModelKey ?? before.chosenModelKey ?? "ollama/gemma4:e2b";
      const targetModelTag = modelTagFromKey(targetModelKey);

      if (!(await this.access.isModelAvailable(runtime, targetModelTag))) {
        await this.setProgressState(action, "downloading-model", "ChillClaw is downloading the starter local model.");
        await this.pullModelWithRetry(action, runtime, targetModelTag);
      }

      await this.setProgressState(action, "configuring-openclaw", "ChillClaw is connecting OpenClaw to the local Ollama runtime.");
      const mutation = await this.access.upsertManagedLocalModelEntry({
        label: "Local AI on this Mac",
        providerId: "ollama",
        methodId: "ollama-local",
        modelKey: targetModelKey,
        entryId: persisted?.managedEntryId
      });

      await this.access.restartGateway();

      const managedEntry =
        mutation.modelConfig.savedEntries.find((entry) => entry.id === mutation.modelConfig.defaultEntryId) ??
        mutation.modelConfig.savedEntries.find((entry) => entry.modelKey === targetModelKey);
      await this.access.writePersistedState({
        managedEntryId: managedEntry?.id ?? persisted?.managedEntryId,
        selectedModelKey: targetModelKey,
        status: "ready",
        activeAction: undefined,
        activePhase: undefined,
        progressMessage: undefined,
        progressDigest: undefined,
        progressCompletedBytes: undefined,
        progressTotalBytes: undefined,
        progressPercent: undefined,
        lastProgressAt: undefined,
        downloadJobId: persisted?.downloadJobId,
        lastError: undefined
      });
      const localRuntime = await this.getOverview(mutation.modelConfig);
      const message = "Local AI is ready on this Mac.";
      this.access.publishCompleted(action, "completed", message, localRuntime);

      return {
        status: "completed",
        message,
        localRuntime
      };
    } catch (error) {
      await this.access.writePersistedState({
        ...(await this.access.readPersistedState()),
        status: "failed",
        lastError: error instanceof Error ? error.message : String(error),
        activeAction: undefined,
        activePhase: undefined,
        progressMessage: undefined,
        progressDigest: undefined,
        progressCompletedBytes: undefined,
        progressTotalBytes: undefined,
        progressPercent: undefined,
        lastProgressAt: undefined
      });
      const localRuntime = await this.getOverview();
      const message = error instanceof Error ? error.message : "ChillClaw could not finish local AI setup.";
      this.access.publishCompleted(action, "failed", message, localRuntime);
      return {
        status: "failed",
        message,
        localRuntime
      };
    }
  }

  private async pullModelWithRetry(
    action: LocalModelRuntimeAction,
    runtime: ResolvedOllamaRuntime,
    modelTag: string
  ): Promise<void> {
    for (let attempt = 1; attempt <= LOCAL_MODEL_PULL_MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.access.pullModel(runtime, modelTag, async (progress) => {
          await this.setDownloadProgressState(action, progress);
        });
        if (await this.access.isModelAvailable(runtime, modelTag)) {
          return;
        }
        throw createRetryableError("The local model download ended before Ollama reported the model as available.", true);
      } catch (error) {
        if (!isRetryableError(error) || attempt >= LOCAL_MODEL_PULL_MAX_ATTEMPTS) {
          throw error;
        }

        const retryMessage = `The local model download was interrupted. Retrying (${attempt + 1}/${LOCAL_MODEL_PULL_MAX_ATTEMPTS}).`;
        await this.setProgressState(action, "downloading-model", retryMessage);
      }
    }
  }

  private async setProgressState(action: LocalModelRuntimeAction, status: Extract<
    LocalModelRuntimeStatus,
    "installing-runtime" | "starting-runtime" | "downloading-model" | "configuring-openclaw"
  >, message: string): Promise<void> {
    const persisted = await this.access.readPersistedState();
    await this.access.writePersistedState({
      ...persisted,
      status,
      lastError: undefined,
      activeAction: action,
      activePhase: progressPhaseForStatus(status),
      progressMessage: message,
      progressDigest: status === "downloading-model" ? persisted?.progressDigest : undefined,
      progressCompletedBytes: status === "downloading-model" ? persisted?.progressCompletedBytes : undefined,
      progressTotalBytes: status === "downloading-model" ? persisted?.progressTotalBytes : undefined,
      progressPercent: status === "downloading-model" ? persisted?.progressPercent : undefined,
      downloadJobId: status === "downloading-model" ? persisted?.downloadJobId : undefined,
      lastProgressAt: new Date().toISOString()
    });
    await this.publishProgressSnapshot(action, progressPhaseForStatus(status), message);
  }

  private async setDownloadProgressState(action: LocalModelRuntimeAction, progress: PullModelProgress): Promise<void> {
    const message = describePullProgress(progress);
    const persisted = await this.access.readPersistedState();
    await this.access.writePersistedState({
      ...persisted,
      status: "downloading-model",
      lastError: undefined,
      activeAction: action,
      activePhase: "downloading-model",
      progressMessage: message,
      progressDigest: progress.digest,
      progressCompletedBytes: progress.completed,
      progressTotalBytes: progress.total,
      progressPercent: progressPercentForPull(progress),
      downloadJobId: progress.downloadJobId ?? persisted?.downloadJobId,
      lastProgressAt: new Date().toISOString()
    });
    await this.publishProgressSnapshot(action, "downloading-model", message);
  }

  private async publishProgressSnapshot(action: LocalModelRuntimeAction, phase: LocalModelRuntimePhase, message: string): Promise<void> {
    const localRuntime = await this.getOverview();
    this.access.publishProgress(action, phase, message, localRuntime, localRuntime.progressPercent);
  }
}

function progressPhaseForStatus(status: Extract<
  LocalModelRuntimeStatus,
  "installing-runtime" | "starting-runtime" | "downloading-model" | "configuring-openclaw"
>): LocalModelRuntimePhase {
  switch (status) {
    case "installing-runtime":
      return "installing-runtime";
    case "starting-runtime":
      return "starting-runtime";
    case "downloading-model":
      return "downloading-model";
    case "configuring-openclaw":
    default:
      return "configuring-openclaw";
  }
}

export async function commandExists(path: string, pathValue = process.env.PATH): Promise<boolean> {
  if (!path.includes("/")) {
    for (const directory of pathValue?.split(delimiter) ?? []) {
      if (!directory) {
        continue;
      }

      if (await commandExists(join(directory, path))) {
        return true;
      }
    }

    return false;
  }

  try {
    const file = await stat(path);
    return file.isFile() && (file.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export async function resolveInstalledRuntimeCandidate(
  candidates: ResolvedOllamaRuntime[]
): Promise<ResolvedOllamaRuntime | undefined> {
  for (const candidate of candidates) {
    if (!(await commandExists(candidate.command))) {
      continue;
    }

    const result = await runLoggedCommand("localModelRuntime.resolveInstalledRuntime", candidate.command, ["--version"], {
      allowFailure: true
    });
    if (result.code === 0) {
      return candidate;
    }
  }

  return undefined;
}

function ollamaEnvironment(runtime: ResolvedOllamaRuntime): Record<string, string | undefined> {
  if (!runtime.managed) {
    return {};
  }

  return {
    OLLAMA_MODELS: getManagedOllamaModelsDir(),
    OLLAMA_HOST: "127.0.0.1:11434"
  };
}

async function runLoggedCommand(
  scope: string,
  command: string,
  args: string[],
  options?: { envOverrides?: Record<string, string | undefined>; allowFailure?: boolean; timeoutMs?: number }
): Promise<{ code: number; stdout: string; stderr: string }> {
  logDevelopmentCommand(scope, command, args);
  return runCommand(command, args, {
    allowFailure: options?.allowFailure,
    env: {
      ...process.env,
      ...(options?.envOverrides ?? {})
    },
    timeoutMs: options?.timeoutMs ?? LOCAL_MODEL_COMMAND_TIMEOUT_MS
  });
}

async function waitForRuntime(command: ResolvedOllamaRuntime): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(2_000)
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the deadline.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`ChillClaw could not reach the local Ollama runtime at ${command.command}.`);
}

type RuntimeListener = {
  pid: number;
  command: string;
};

export function isStaleManagedOllamaListenerCommand(command: string): boolean {
  if (!command.includes(`${getManagedOllamaDir()}/`)) {
    return false;
  }

  const currentCommand = getManagedOllamaCliPath();
  return command !== currentCommand && !command.startsWith(`${currentCommand} `);
}

async function listOllamaRuntimeListeners(): Promise<RuntimeListener[]> {
  if (process.platform !== "darwin") {
    return [];
  }

  let listeners: { code: number; stdout: string };
  try {
    listeners = await runLoggedCommand(
      "localModelRuntime.inspectRuntimeListener",
      "lsof",
      ["-nP", "-t", `-iTCP:${OLLAMA_PORT}`, "-sTCP:LISTEN"],
      { allowFailure: true }
    );
  } catch {
    return [];
  }
  if (listeners.code !== 0) {
    return [];
  }

  const pids = [
    ...new Set(
      listeners.stdout
        .split(/\s+/u)
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0)
    )
  ];
  const result: RuntimeListener[] = [];
  for (const pid of pids) {
    let processInfo: { code: number; stdout: string };
    try {
      processInfo = await runLoggedCommand(
        "localModelRuntime.inspectRuntimeProcess",
        "ps",
        ["-p", String(pid), "-o", "command="],
        { allowFailure: true }
      );
    } catch {
      continue;
    }
    const command = processInfo.stdout.trim();
    if (processInfo.code === 0 && command.length > 0) {
      result.push({ pid, command });
    }
  }
  return result;
}

async function hasStaleManagedOllamaServer(runtime: ResolvedOllamaRuntime | undefined): Promise<boolean> {
  if (!runtime?.managed) {
    return false;
  }

  const listeners = await listOllamaRuntimeListeners();
  return listeners.some((listener) => isStaleManagedOllamaListenerCommand(listener.command));
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  return !isProcessRunning(pid);
}

async function stopStaleManagedOllamaServers(runtime: ResolvedOllamaRuntime): Promise<void> {
  if (!runtime.managed) {
    return;
  }

  const staleListeners = (await listOllamaRuntimeListeners()).filter((listener) =>
    isStaleManagedOllamaListenerCommand(listener.command)
  );
  for (const listener of staleListeners) {
    try {
      logDevelopmentCommand("localModelRuntime.stopStaleRuntime", "kill", ["-TERM", String(listener.pid)]);
      process.kill(listener.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        continue;
      }
      throw new Error(`ChillClaw found a stale managed Ollama runtime but could not stop process ${listener.pid}.`);
    }

    if (await waitForProcessExit(listener.pid)) {
      continue;
    }

    logDevelopmentCommand("localModelRuntime.stopStaleRuntime", "kill", ["-KILL", String(listener.pid)]);
    process.kill(listener.pid, "SIGKILL");
    await waitForProcessExit(listener.pid, 2_000);
  }
}

async function pullModelViaDownloadManager(
  downloadManager: DownloadManager,
  modelTag: string,
  publishProgress: (progress: PullModelProgress) => void | Promise<void>
): Promise<void> {
  const job = await downloadManager.enqueue({
    type: "model",
    artifactId: `ollama-model:${modelTag}`,
    displayName: `Local model ${modelTag}`,
    source: {
      kind: "ollama-pull",
      modelTag
    },
    priority: 20,
    silent: false,
    requester: "model-manager",
    dedupeKey: `model:ollama:${modelTag}`,
    destinationPolicy: {
      baseDir: "cache",
      fileName: `${safeDownloadFileName(modelTag)}.json`
    }
  });

  const unsubscribe = downloadManager.subscribe((event) => {
    if (event.type === "download.progress" && event.jobId === job.id) {
      void publishProgress({
        status: "downloading model",
        completed: event.downloadedBytes,
        total: event.totalBytes,
        downloadJobId: job.id
      });
    }
    if (event.type === "download.completed" && event.job.id === job.id) {
      void publishProgress({
        status: "success",
        downloadJobId: job.id
      });
    }
  });

  try {
    const completed = await downloadManager.waitForJob(job.id);
    if (completed.status !== "completed") {
      throw createRetryableError(completed.error?.message ?? "The local model download did not finish.", true);
    }
  } finally {
    unsubscribe();
  }
}

function safeDownloadFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "ollama-model";
}

export function createLocalModelRuntimeService(
  adapter: EngineAdapter,
  store: StateStore,
  eventPublisher?: EventPublisher,
  runtimeManager?: RuntimeManager,
  downloadManager?: DownloadManager
): LocalModelRuntimeService {
  return new LocalModelRuntimeService({
    inspectHost: async () => {
      const availableDiskBytes = await getAvailableDiskBytes(getManagedOllamaDir());
      return {
        platform: process.platform,
        architecture: process.arch,
        totalMemoryGb: Number((totalmem() / 1024 / 1024 / 1024).toFixed(1)),
        freeDiskGb: Number((availableDiskBytes / 1024 / 1024 / 1024).toFixed(1))
      };
    },
    readPersistedState: async () => (await store.read()).localModelRuntime,
    writePersistedState: async (nextState) => {
      await store.update((current) => ({
        ...current,
        localModelRuntime: nextState
      }));
    },
    fetchModelSelection: async () => adapter.config.getModelSelection(),
    resolveInstalledRuntime: async () => {
      return resolveInstalledRuntimeCandidate([
        { command: getManagedOllamaCliPath(), source: "managed-install" as const, managed: true },
        { command: resolve("/Applications/Ollama.app/Contents/Resources/ollama"), source: "existing-install" as const, managed: false },
        { command: resolve(homedir(), "Applications/Ollama.app/Contents/Resources/ollama"), source: "existing-install" as const, managed: false },
        { command: "ollama", source: "existing-install" as const, managed: false }
      ]);
    },
    installManagedRuntime: async () => {
      if (runtimeManager) {
        const result = await runtimeManager.prepare("ollama-runtime");
        if (result.status !== "completed") {
          throw new Error(result.message);
        }
        const resolved = await resolveInstalledRuntimeCandidate([
          { command: getManagedOllamaCliPath(), source: "managed-install" as const, managed: true }
        ]);
        if (!resolved) {
          throw new Error("ChillClaw prepared Ollama, but the managed Ollama command is not executable.");
        }
        return resolved;
      }

      throw new Error("ChillClaw requires RuntimeManager to prepare the managed Ollama runtime.");
    },
    prepareRuntimeEndpoint: async (runtime) => {
      await stopStaleManagedOllamaServers(runtime);
    },
    isRuntimeReachable: async (runtime) => {
      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
          signal: AbortSignal.timeout(2_000)
        });
        return response.ok && !(await hasStaleManagedOllamaServer(runtime));
      } catch {
        return false;
      }
    },
    startRuntime: async (runtime) => {
      await stopStaleManagedOllamaServers(runtime);
      logDevelopmentCommand("localModelRuntime.startRuntime", runtime.command, ["serve"]);
      const child = spawn(runtime.command, ["serve"], {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ...ollamaEnvironment(runtime)
        }
      });
      child.unref();
      await waitForRuntime(runtime);
    },
    isModelAvailable: async (runtime, modelTag) => {
      const result = await runLoggedCommand("localModelRuntime.isModelAvailable", runtime.command, ["show", modelTag], {
        envOverrides: ollamaEnvironment(runtime),
        allowFailure: true
      });
      return result.code === 0;
    },
    pullModel: async (_runtime, modelTag, publishProgress) => {
      if (!downloadManager) {
        throw new Error("ChillClaw requires DownloadManager to pull local Ollama models.");
      }
      await pullModelViaDownloadManager(downloadManager, modelTag, publishProgress);
    },
    upsertManagedLocalModelEntry: async (request) => adapter.config.upsertManagedLocalModelEntry(request),
    restartGateway: async () => adapter.gateway.restartGateway(),
    publishProgress: (action, phase, message, localRuntime, percent) => {
      eventPublisher?.publishLocalRuntimeProgress({
        action,
        phase,
        percent,
        message,
        localRuntime
      });
    },
    publishCompleted: (action, status, message, localRuntime) => {
      eventPublisher?.publishLocalRuntimeCompleted({
        action,
        status,
        message,
        localRuntime
      });
    }
  });
}
