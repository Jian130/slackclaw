import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  ChillClawEvent,
  DownloadError,
  DownloadJob,
  DownloadJobStatus,
  DownloadManagerOverview,
  DownloadRequest,
  DownloadSource
} from "@chillclaw/contracts";
import { getAvailableDiskBytes } from "../platform/disk-space.js";

const ACTIVE_DOWNLOAD_STATUSES = new Set<DownloadJobStatus>([
  "queued",
  "preparing",
  "downloading",
  "paused",
  "verifying"
]);

const TERMINAL_DOWNLOAD_STATUSES = new Set<DownloadJobStatus>(["completed", "failed", "cancelled"]);
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/pull";
const PROGRESS_PERSIST_INTERVAL_MS = 250;

export interface DownloadManagerState {
  checkedAt?: string;
  jobs: Record<string, DownloadJob>;
}

export interface DownloadManagerOptions {
  readState: () => Promise<DownloadManagerState | undefined>;
  writeState: (state: DownloadManagerState) => Promise<void>;
  cacheDir: string;
  tempDir: string;
  runtimeDir?: string;
  modelsDir?: string;
  assetsDir?: string;
  now?: () => number;
  publishEvent?: (event: ChillClawEvent) => void;
}

type ActiveRun = {
  controller: AbortController;
  promise: Promise<DownloadJob>;
  lastPersistAt: number;
  startedAt: number;
  startedBytes: number;
};

export class DownloadManager {
  private state: DownloadManagerState | undefined;
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly listeners = new Set<(event: ChillClawEvent) => void>();
  private readonly epoch = `downloads-${randomUUID()}`;
  private revision = 0;

  constructor(private readonly options: DownloadManagerOptions) {}

  subscribe(listener: (event: ChillClawEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async enqueue(request: DownloadRequest): Promise<DownloadJob> {
    const state = await this.readState();
    const dedupeKey = request.dedupeKey ?? defaultDedupeKey(request);
    const existing = Object.values(state.jobs).find(
      (job) => job.dedupeKey === dedupeKey && ACTIVE_DOWNLOAD_STATUSES.has(job.status)
    );
    if (existing) {
      return existing;
    }

    const now = this.now();
    const destinationPath = this.destinationPathFor(request);
    const tempPath = resolve(this.options.tempDir, `${safeFileName(request.artifactId)}-${randomUUID()}.part`);
    await mkdir(dirname(tempPath), { recursive: true });
    const job: DownloadJob = {
      id: `download-${randomUUID()}`,
      type: request.type,
      artifactId: request.artifactId,
      displayName: request.displayName,
      version: request.version,
      source: request.source,
      destinationPath,
      tempPath,
      expectedBytes: request.expectedBytes,
      requiredBytes: request.requiredBytes,
      downloadedBytes: 0,
      progress: 0,
      checksum: request.checksum,
      status: "queued",
      priority: request.priority ?? 0,
      silent: request.silent ?? false,
      requester: request.requester ?? "system",
      dedupeKey,
      createdAt: now,
      updatedAt: now,
      metadata: request.metadata
    };

    await this.updateJob(job);
    if (request.autoStart !== false) {
      this.schedule(job.id);
    }
    return job;
  }

  async getOverview(): Promise<DownloadManagerOverview> {
    const state = await this.readState();
    return this.overviewFor(state);
  }

  async listJobs(): Promise<DownloadJob[]> {
    const state = await this.readState();
    return sortedJobs(state);
  }

  async getJob(jobId: string): Promise<DownloadJob | null> {
    const state = await this.readState();
    return state.jobs[jobId] ?? null;
  }

  async waitForJob(jobId: string): Promise<DownloadJob> {
    const run = this.activeRuns.get(jobId);
    if (run) {
      return run.promise;
    }
    const job = await this.requireJob(jobId);
    if (job.status === "queued") {
      return this.start(jobId);
    }
    return job;
  }

  async pause(jobId: string): Promise<DownloadJob> {
    const job = await this.requireJob(jobId);
    if (job.status === "queued" || job.status === "preparing") {
      return this.setStatus(job, "paused");
    }
    if (job.status === "downloading") {
      this.activeRuns.get(jobId)?.controller.abort();
      return this.setStatus(job, "paused");
    }
    return job;
  }

  async resume(jobId: string): Promise<DownloadJob> {
    const job = await this.requireJob(jobId);
    if (job.status === "completed") {
      return job;
    }
    await this.setStatus(job, "queued", { clearError: true });
    this.schedule(jobId);
    return this.requireJob(jobId);
  }

  async cancel(jobId: string): Promise<DownloadJob> {
    const job = await this.requireJob(jobId);
    this.activeRuns.get(jobId)?.controller.abort();
    return this.setStatus(job, "cancelled");
  }

  async remove(jobId: string): Promise<void> {
    const state = await this.readState();
    const job = state.jobs[jobId];
    if (!job) {
      return;
    }
    if (ACTIVE_DOWNLOAD_STATUSES.has(job.status) && job.status !== "paused") {
      await this.cancel(jobId);
    }
    delete state.jobs[jobId];
    await this.writeState(state);
    this.publishSnapshot(state);
  }

  async resumePersistedJobs(): Promise<void> {
    const state = await this.readState();
    const jobs = sortedJobs(state);
    for (const job of jobs) {
      if (job.status === "paused" || TERMINAL_DOWNLOAD_STATUSES.has(job.status)) {
        continue;
      }
      if (ACTIVE_DOWNLOAD_STATUSES.has(job.status)) {
        await this.setStatus(job, "queued", { clearError: true });
        await this.waitForJob(job.id);
      }
    }
  }

  private schedule(jobId: string): void {
    if (this.activeRuns.has(jobId)) {
      return;
    }
    setTimeout(() => {
      void this.start(jobId);
    }, 0);
  }

  private async start(jobId: string): Promise<DownloadJob> {
    const existingRun = this.activeRuns.get(jobId);
    if (existingRun) {
      return existingRun.promise;
    }

    const controller = new AbortController();
    const current = await this.requireJob(jobId);
    if (current.status !== "queued" && current.status !== "failed") {
      return current;
    }

    const run: ActiveRun = {
      controller,
      lastPersistAt: 0,
      startedAt: this.now(),
      startedBytes: current.downloadedBytes,
      promise: Promise.resolve(current)
    };
    run.promise = this.execute(current.id, controller.signal, run).finally(async () => {
      if (this.activeRuns.get(current.id) === run) {
        this.activeRuns.delete(current.id);
      }
      return this.requireJob(current.id);
    });
    this.activeRuns.set(current.id, run);
    return run.promise;
  }

  private async execute(jobId: string, signal: AbortSignal, run: ActiveRun): Promise<DownloadJob> {
    let job = await this.setStatus(await this.requireJob(jobId), "preparing", { clearError: true });
    try {
      await this.checkDisk(job);
      job = await this.setStatus(job, "downloading");
      switch (job.source.kind) {
        case "file":
          await this.downloadFile(job, signal, run);
          break;
        case "http":
          await this.downloadHttp(job, signal, run);
          break;
        case "ollama-pull":
          await this.downloadOllamaModel(job, signal, run);
          break;
      }
      job = await this.setStatus(await this.requireJob(job.id), "verifying");
      await this.verifyCompletedJob(job);
      const completed = await this.complete(job.id);
      return completed;
    } catch (error) {
      const latest = await this.requireJob(jobId);
      if (latest.status === "paused" || latest.status === "cancelled") {
        return latest;
      }
      if (signal.aborted) {
        return this.setStatus(latest, "paused");
      }
      return this.fail(latest.id, normalizeDownloadError(error));
    }
  }

  private async downloadFile(job: DownloadJob, signal: AbortSignal, run: ActiveRun): Promise<void> {
    assertNotAborted(signal);
    await mkdir(dirname(job.tempPath), { recursive: true });
    const source = job.source as Extract<DownloadSource, { kind: "file" }>;
    const file = await stat(source.path);
    await copyFile(source.path, job.tempPath);
    await this.recordProgress(job.id, file.size, file.size, run, true);
  }

  private async downloadHttp(job: DownloadJob, signal: AbortSignal, run: ActiveRun): Promise<void> {
    const source = job.source as Extract<DownloadSource, { kind: "http" }>;
    const urls = [source.url, ...(source.fallbackUrls ?? [])];
    let lastError: unknown;
    for (const url of urls) {
      try {
        await this.downloadHttpUrl(job, url, signal, run);
        return;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError ?? new Error("Download failed.");
  }

  private async downloadHttpUrl(job: DownloadJob, url: string, signal: AbortSignal, run: ActiveRun): Promise<void> {
    await mkdir(dirname(job.tempPath), { recursive: true });
    let partialBytes = await fileSize(job.tempPath);
    const headers: Record<string, string> = {};
    if (partialBytes > 0) {
      headers.Range = `bytes=${partialBytes}-`;
    }

    const response = await fetch(url, {
      headers,
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Download failed with HTTP ${response.status}.`);
    }

    if (partialBytes > 0 && response.status !== 206) {
      await rm(job.tempPath, { force: true });
      partialBytes = 0;
    }

    const totalBytes = totalBytesFromResponse(response, partialBytes) ?? job.expectedBytes;
    const writer = createWriteStream(job.tempPath, {
      flags: partialBytes > 0 && response.status === 206 ? "a" : "w"
    });
    let downloadedBytes = partialBytes;
    const reader = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

    const thisManager = this;
    await pipeline(
      reader,
      async function* (source) {
        for await (const chunk of source) {
          assertNotAborted(signal);
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          downloadedBytes += buffer.length;
          await thisManagerRecordProgress(downloadedBytes, totalBytes);
          yield buffer;
        }
      },
      writer
    );

    await this.recordProgress(job.id, downloadedBytes, totalBytes, run, true);

    async function thisManagerRecordProgress(downloaded: number, total: number | undefined): Promise<void> {
      await thisManager.recordProgress(job.id, downloaded, total, run);
    }
  }

  private async downloadOllamaModel(job: DownloadJob, signal: AbortSignal, run: ActiveRun): Promise<void> {
    const source = job.source as Extract<DownloadSource, { kind: "ollama-pull" }>;
    const endpoint = source.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: source.modelTag
      }),
      signal
    }).catch((error) => {
      throw toRetryableError(error, true);
    });

    if (!response.ok) {
      throw toRetryableError(await readResponseError(response), response.status >= 500);
    }
    if (!response.body) {
      throw toRetryableError("Ollama did not return a download progress stream.", true);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawSuccess = false;
    let lastCompleted = 0;
    let lastTotal = job.expectedBytes;

    const publishParsedLine = async (line: string) => {
      if (!line.trim()) {
        return;
      }
      const parsed = parseOllamaProgress(line);
      if ("error" in parsed) {
        throw toRetryableError(parsed.error, false);
      }
      if (parsed.status === "success") {
        sawSuccess = true;
        await this.recordProgress(job.id, lastTotal ?? lastCompleted, lastTotal ?? lastCompleted, run, true);
        return;
      }
      lastCompleted = parsed.completed ?? lastCompleted;
      lastTotal = parsed.total ?? lastTotal;
      await this.recordProgress(job.id, lastCompleted, lastTotal, run);
    };

    for (;;) {
      assertNotAborted(signal);
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await publishParsedLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }

    const trailing = `${buffer}${decoder.decode()}`.trim();
    if (trailing) {
      await publishParsedLine(trailing);
    }
    if (!sawSuccess) {
      throw toRetryableError("Ollama ended the pull stream before reporting success.", true);
    }
    await writeFile(job.tempPath, JSON.stringify({ modelTag: source.modelTag, completedAt: new Date(this.now()).toISOString() }));
  }

  private async checkDisk(job: DownloadJob): Promise<void> {
    const requiredBytes = job.requiredBytes ?? job.expectedBytes;
    if (!requiredBytes) {
      return;
    }
    const freeBytes = await getAvailableDiskBytes(dirname(job.destinationPath));
    if (freeBytes < requiredBytes) {
      throw toRetryableError("ChillClaw needs more free disk space before starting this download.", false, "disk-space");
    }
  }

  private async verifyCompletedJob(job: DownloadJob): Promise<void> {
    if (job.source.kind === "ollama-pull") {
      return;
    }

    const size = await fileSize(job.tempPath);
    if (job.expectedBytes && size !== job.expectedBytes) {
      throw toRetryableError(`Downloaded size mismatch for ${job.displayName}.`, true, "size-mismatch");
    }
    if (job.checksum) {
      const digest = await sha256File(job.tempPath);
      if (digest !== job.checksum.toLowerCase()) {
        await rm(job.tempPath, { force: true });
        await rm(job.destinationPath, { force: true });
        throw toRetryableError(`Downloaded checksum mismatch for ${job.displayName}.`, true, "checksum-mismatch");
      }
    }
  }

  private async complete(jobId: string): Promise<DownloadJob> {
    const job = await this.requireJob(jobId);
    await mkdir(dirname(job.destinationPath), { recursive: true });
    if (job.source.kind !== "ollama-pull") {
      await rm(job.destinationPath, { force: true });
    }
    await rename(job.tempPath, job.destinationPath);
    const completed = await this.updateJob({
      ...job,
      status: "completed",
      downloadedBytes: job.expectedBytes ?? job.downloadedBytes,
      progress: 100,
      completedAt: this.now(),
      updatedAt: this.now(),
      error: undefined
    });
    this.publish({
      type: "download.completed",
      job: completed
    });
    return completed;
  }

  private async fail(jobId: string, error: DownloadError): Promise<DownloadJob> {
    const job = await this.requireJob(jobId);
    const failed = await this.updateJob({
      ...job,
      status: "failed",
      updatedAt: this.now(),
      error
    });
    this.publish({
      type: "download.failed",
      jobId,
      error
    });
    return failed;
  }

  private async recordProgress(
    jobId: string,
    downloadedBytes: number,
    totalBytes: number | undefined,
    run: ActiveRun,
    force = false
  ): Promise<void> {
    const now = this.now();
    const progress = totalBytes && totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))) : 0;
    const speedWindowMs = Math.max(1, now - run.startedAt);
    const speedBps = Math.round(((downloadedBytes - run.startedBytes) / speedWindowMs) * 1000);
    const shouldPersist = force || now - run.lastPersistAt >= PROGRESS_PERSIST_INTERVAL_MS;
    if (shouldPersist) {
      const job = await this.requireJob(jobId);
      await this.updateJob({
        ...job,
        expectedBytes: job.expectedBytes ?? totalBytes,
        downloadedBytes,
        progress,
        updatedAt: now
      });
      run.lastPersistAt = now;
    }
    this.publish({
      type: "download.progress",
      jobId,
      downloadedBytes,
      totalBytes,
      progress,
      speedBps
    });
  }

  private async setStatus(
    job: DownloadJob,
    status: DownloadJobStatus,
    options?: { clearError?: boolean }
  ): Promise<DownloadJob> {
    const next = await this.updateJob({
      ...job,
      status,
      updatedAt: this.now(),
      error: options?.clearError ? undefined : job.error
    });
    this.publish({
      type: "download.status",
      jobId: job.id,
      status
    });
    return next;
  }

  private async requireJob(jobId: string): Promise<DownloadJob> {
    const state = await this.readState();
    const job = state.jobs[jobId];
    if (!job) {
      throw new Error(`Download job ${jobId} was not found.`);
    }
    return job;
  }

  private async updateJob(job: DownloadJob): Promise<DownloadJob> {
    const state = await this.readState();
    const nextState: DownloadManagerState = {
      checkedAt: new Date(this.now()).toISOString(),
      jobs: {
        ...state.jobs,
        [job.id]: job
      }
    };
    await this.writeState(nextState);
    this.publishSnapshot(nextState);
    return job;
  }

  private async readState(): Promise<DownloadManagerState> {
    if (!this.state) {
      this.state = (await this.options.readState()) ?? {
        jobs: {}
      };
    }
    return this.state;
  }

  private async writeState(state: DownloadManagerState): Promise<void> {
    this.state = state;
    await this.options.writeState(state);
  }

  private publishSnapshot(state: DownloadManagerState): void {
    this.revision += 1;
    this.publish({
      type: "downloads.updated",
      snapshot: {
        epoch: this.epoch,
        revision: this.revision,
        data: this.overviewFor(state)
      }
    });
  }

  private publish(event: ChillClawEvent): void {
    this.options.publishEvent?.(event);
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  private overviewFor(state: DownloadManagerState): DownloadManagerOverview {
    const jobs = sortedJobs(state);
    const activeCount = jobs.filter((job) => job.status === "preparing" || job.status === "downloading" || job.status === "verifying").length;
    const queuedCount = jobs.filter((job) => job.status === "queued").length;
    const failedCount = jobs.filter((job) => job.status === "failed").length;
    return {
      checkedAt: new Date(this.now()).toISOString(),
      jobs,
      activeCount,
      queuedCount,
      failedCount,
      summary:
        failedCount > 0
          ? `${failedCount} download${failedCount === 1 ? "" : "s"} need attention.`
          : activeCount > 0
            ? `${activeCount} download${activeCount === 1 ? " is" : "s are"} active.`
            : queuedCount > 0
              ? `${queuedCount} download${queuedCount === 1 ? " is" : "s are"} queued.`
              : "No downloads are running."
    };
  }

  private destinationPathFor(request: DownloadRequest): string {
    const baseDir = (() => {
      switch (request.destinationPolicy.baseDir) {
        case "runtime":
          return this.options.runtimeDir ?? this.options.cacheDir;
        case "models":
          return this.options.modelsDir ?? this.options.cacheDir;
        case "assets":
          return this.options.assetsDir ?? this.options.cacheDir;
        case "cache":
        default:
          return this.options.cacheDir;
      }
    })();
    return resolve(baseDir, request.destinationPolicy.fileName ?? defaultFileNameFor(request));
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function sortedJobs(state: DownloadManagerState): DownloadJob[] {
  return Object.values(state.jobs).sort((left, right) => right.priority - left.priority || left.createdAt - right.createdAt);
}

function defaultDedupeKey(request: DownloadRequest): string {
  return [
    request.type,
    request.artifactId,
    request.version ?? "",
    sourceIdentity(request.source)
  ].join(":");
}

function sourceIdentity(source: DownloadSource): string {
  switch (source.kind) {
    case "http":
      return source.url;
    case "file":
      return source.path;
    case "ollama-pull":
      return source.modelTag;
  }
}

function defaultFileNameFor(request: DownloadRequest): string {
  const version = request.version ? `-${request.version}` : "";
  switch (request.source.kind) {
    case "http": {
      try {
        const pathname = new URL(request.source.url).pathname;
        const name = pathname.split("/").filter(Boolean).at(-1);
        if (name) {
          return safeFileName(`${request.artifactId}${version}-${name}`);
        }
      } catch {
        // Fall back to artifact id below.
      }
      return safeFileName(`${request.artifactId}${version}.download`);
    }
    case "file":
      return safeFileName(`${request.artifactId}${version}`);
    case "ollama-pull":
      return safeFileName(`${request.artifactId}${version}.json`);
  }
}

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "download";
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

function totalBytesFromResponse(response: Response, partialBytes: number): number | undefined {
  const range = response.headers.get("content-range")?.match(/\/(\d+)$/u);
  if (range) {
    return Number(range[1]);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return partialBytes + contentLength;
  }
  return undefined;
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw toRetryableError("Download was paused.", true, "aborted");
  }
}

function normalizeDownloadError(error: unknown): DownloadError {
  const candidate = error as Partial<DownloadError>;
  if (candidate.code && candidate.message) {
    return {
      code: candidate.code,
      message: candidate.message,
      retriable: candidate.retriable ?? false
    };
  }
  return {
    code: "download-failed",
    message: error instanceof Error ? error.message : String(error),
    retriable: true
  };
}

function toRetryableError(error: unknown, retriable: boolean, code = "download-failed"): DownloadError {
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
    retriable
  };
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error?.trim()) {
      return payload.error.trim();
    }
  } catch {
    // Keep status fallback.
  }
  return response.statusText || `Request failed with status ${response.status}.`;
}

function parseOllamaProgress(line: string): { status: string; digest?: string; total?: number; completed?: number } | { error: string } {
  try {
    return JSON.parse(line) as { status: string; digest?: string; total?: number; completed?: number } | { error: string };
  } catch {
    throw toRetryableError(`ChillClaw could not parse Ollama pull progress: ${line}`, true, "parse-progress");
  }
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolvePromise(hash.digest("hex"));
    });
  });
}
