import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";

import {
  createDefaultRuntimeManagerOverview,
  type RuntimeAction,
  type RuntimeActionResponse,
  type RuntimeJobPhase,
  type RuntimeManagerOverview,
  type RuntimeResourceId,
  type RuntimeResourceKind,
  type RuntimeResourceOverview,
  type RuntimeSourcePolicy
} from "@chillclaw/contracts";

import type {
  RuntimeArtifactManifest,
  RuntimeManagerPublishCompletedArgs,
  RuntimeManagerPublishProgressArgs,
  RuntimeManagerPublishUpdateStagedArgs,
  RuntimeManagerState,
  RuntimeManifestDocument,
  RuntimeResourceManifest,
  RuntimeResourceProvider,
  RuntimeResourceStoredState
} from "./types.js";

export type {
  RuntimeManagerState,
  RuntimeResourceProvider,
  RuntimeResourceManifest,
  RuntimeManifestDocument
} from "./types.js";

interface RuntimeManagerOptions {
  loadManifest: () => Promise<RuntimeManifestDocument>;
  loadUpdateManifest?: () => Promise<RuntimeManifestDocument>;
  readState: () => Promise<RuntimeManagerState | undefined>;
  writeState: (state: RuntimeManagerState) => Promise<void>;
  providers: RuntimeResourceProvider[];
  downloadArtifact?: (context: {
    resource: RuntimeResourceManifest;
    artifact: RuntimeArtifactManifest;
  }) => Promise<{ artifact: RuntimeArtifactManifest; jobId?: string }>;
  publishProgress?: (args: RuntimeManagerPublishProgressArgs & { runtimeManager: RuntimeManagerOverview }) => void | Promise<void>;
  publishCompleted?: (args: RuntimeManagerPublishCompletedArgs & { runtimeManager: RuntimeManagerOverview }) => void | Promise<void>;
  publishUpdateStaged?: (args: RuntimeManagerPublishUpdateStagedArgs & { runtimeManager: RuntimeManagerOverview }) => void | Promise<void>;
}

interface RuntimeActionBase {
  id: string;
  action: RuntimeAction;
}

export class RuntimeManager {
  private readonly providers = new Map<string, RuntimeResourceProvider>();
  private readonly epoch = `runtime-manager-${randomUUID()}`;
  private revision = 0;

  constructor(private readonly options: RuntimeManagerOptions) {
    for (const provider of options.providers) {
      this.providers.set(provider.id, provider);
    }
  }

  async getOverview(): Promise<RuntimeManagerOverview> {
    const [manifest, updateManifest, state] = await Promise.all([
      this.options.loadManifest(),
      this.loadUpdateManifest(),
      this.readState()
    ]);
    const checkedAt = new Date().toISOString();
    const updates = new Map(updateManifest.resources.map((resource) => [resource.id, resource]));
    const resources = await Promise.all(
      manifest.resources.map((resource) => this.buildResourceOverview(resource, updates.get(resource.id), state, checkedAt))
    );

    return createDefaultRuntimeManagerOverview({
      checkedAt,
      resources
    });
  }

  async prepare(id: string): Promise<RuntimeActionResponse> {
    return this.prepareResource(id, "prepare", new Set<string>());
  }

  async repair(id: string): Promise<RuntimeActionResponse> {
    return this.prepareResource(id, "repair", new Set<string>());
  }

  async checkUpdate(id: string): Promise<RuntimeActionResponse> {
    const { resource, update } = await this.resolveResourcePair(id);
    await this.assertSupported(resource);
    const state = await this.readState();
    const nextResourceState = this.resourceState(state, id);
    const provider = this.providerFor(resource);
    const inspection = await provider.inspect({
      manifest: resource,
      state: nextResourceState
    });
    const installedVersion = nextResourceState.installedVersion ?? inspection.version;
    const latestApprovedVersion = update?.version ?? packagedDesiredUpdateVersion(resource, installedVersion);
    nextResourceState.lastCheckedAt = new Date().toISOString();
    nextResourceState.latestApprovedVersion = latestApprovedVersion;
    nextResourceState.status = nextResourceState.status ?? "missing";
    await this.writeResourceState(state, id, nextResourceState);
    const overview = await this.getOverview();
    return this.response(
      {
        id,
        action: "check-update"
      },
      latestApprovedVersion && latestApprovedVersion !== nextResourceState.installedVersion ? "completed" : "completed",
      latestApprovedVersion && latestApprovedVersion !== nextResourceState.installedVersion
        ? `${resource.label} has an approved update.`
        : `${resource.label} is already on the approved runtime version.`,
      overview
    );
  }

  async stageUpdate(id: string): Promise<RuntimeActionResponse> {
    const { resource, update } = await this.resolveResourcePair(id);
    await this.assertSupported(resource);
    if (!update || update.version === this.resourceState(await this.readState(), id).installedVersion) {
      const overview = await this.getOverview();
      return this.response(
        {
          id,
          action: "stage-update"
        },
        "completed",
        `${resource.label} has no approved update to stage.`,
        overview
      );
    }

    await this.publishProgress(id, "stage-update", "staging", `Staging ${resource.label} ${update.version}.`, 10);
    const source = await this.resolveSource(update);
    if (source.artifact?.sha256) {
      await this.publishProgress(id, "stage-update", "verifying-artifact", `Verifying ${resource.label} update.`, 35);
      await verifyArtifactDigest(source.artifact);
    }
    const state = await this.readState();
    const previousState = this.resourceState(state, id);
    const provider = this.providerFor(resource);
    if (provider.stageUpdate) {
      await provider.stageUpdate({
        manifest: resource,
        staged: update,
        source: source.source,
        artifact: source.artifact,
        state: previousState
      });
    }
    const nextResourceState: RuntimeResourceStoredState = {
      ...previousState,
      status: "staged-update",
      stagedVersion: update.version,
      stagedManifest: update,
      latestApprovedVersion: update.version,
      source: source.source,
      downloadJobId: source.downloadJobId,
      lastCheckedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      lastError: undefined
    };
    await this.writeResourceState(state, id, nextResourceState);
    const overview = await this.getOverview();
    await this.options.publishUpdateStaged?.({
      resourceId: id as RuntimeResourceId,
      version: update.version,
      message: `${resource.label} update is staged.`,
      runtimeManager: overview
    });
    await this.publishCompleted(id, "stage-update", "completed", `${resource.label} update is staged.`, overview);
    return this.response(
      {
        id,
        action: "stage-update"
      },
      "completed",
      `${resource.label} update is staged.`,
      overview
    );
  }

  async stageApprovedUpdates(): Promise<RuntimeActionResponse[]> {
    const [manifest, updateManifest, state] = await Promise.all([
      this.options.loadManifest(),
      this.loadUpdateManifest(),
      this.readState()
    ]);
    const resources = new Map(manifest.resources.map((resource) => [resource.id, resource]));
    const results: RuntimeActionResponse[] = [];

    for (const update of updateManifest.resources) {
      const resource = resources.get(update.id);
      if (!resource) {
        continue;
      }

      try {
        await this.assertSupported(resource);
      } catch {
        continue;
      }

      const currentState = this.resourceState(state, resource.id);
      if (
        resource.updatePolicy !== "stage-silently-apply-safely" ||
        !currentState.installedVersion ||
        currentState.installedVersion === update.version ||
        currentState.stagedVersion
      ) {
        continue;
      }

      results.push(await this.stageUpdate(resource.id));
    }

    return results;
  }

  async applyUpdate(id: string): Promise<RuntimeActionResponse> {
    const { resource } = await this.resolveResourcePair(id);
    await this.assertSupported(resource);
    const state = await this.readState();
    const currentState = this.resourceState(state, id);
    const staged = currentState.stagedManifest;
    if (!staged) {
      const overview = await this.getOverview();
      return this.response(
        {
          id,
          action: "apply-update"
        },
        "failed",
        `${resource.label} has no staged update to apply.`,
        overview
      );
    }

    const previousVersion = currentState.installedVersion;
    const provider = this.providerFor(resource);
    const updatingState: RuntimeResourceStoredState = {
      ...currentState,
      status: "updating",
      previousVersion,
      lastUpdatedAt: new Date().toISOString(),
      lastError: undefined
    };
    await this.writeResourceState(state, id, updatingState);
    await this.publishProgress(id, "apply-update", "switching", `Applying ${resource.label} update.`, 40);

    try {
      const result = await provider.applyUpdate({
        manifest: resource,
        staged,
        previousVersion,
        state: updatingState
      });
      const nextState = await this.readState();
      await this.writeResourceState(nextState, id, {
        ...this.resourceState(nextState, id),
        status: "ready",
        installedVersion: result.version ?? staged.version,
        activePath: result.activePath ?? currentState.activePath,
        stagedVersion: undefined,
        stagedManifest: undefined,
        previousVersion: undefined,
        lastUpdatedAt: new Date().toISOString(),
        lastError: undefined
      });
      const overview = await this.getOverview();
      await this.publishCompleted(id, "apply-update", "completed", `${resource.label} update is ready.`, overview);
      return this.response(
        {
          id,
          action: "apply-update"
        },
        "completed",
        `${resource.label} update is ready.`,
        overview
      );
    } catch (error) {
      await this.publishProgress(id, "apply-update", "rolling-back", `Rolling back ${resource.label}.`, 85);
      await provider.rollback?.({
        manifest: resource,
        staged,
        previousVersion,
        state: updatingState,
        error
      });
      const nextState = await this.readState();
      await this.writeResourceState(nextState, id, {
        ...this.resourceState(nextState, id),
        status: "rollback-required",
        installedVersion: previousVersion,
        activePath: currentState.activePath,
        previousVersion,
        stagedVersion: staged.version,
        stagedManifest: staged,
        lastUpdatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error)
      });
      const overview = await this.getOverview();
      await this.publishCompleted(
        id,
        "apply-update",
        "failed",
        `${resource.label} update failed and ChillClaw restored the previous runtime.`,
        overview
      );
      return this.response(
        {
          id,
          action: "apply-update"
        },
        "failed",
        `${resource.label} update failed and ChillClaw restored the previous runtime.`,
        overview
      );
    }
  }

  async rollback(id: string): Promise<RuntimeActionResponse> {
    const { resource } = await this.resolveResourcePair(id);
    const state = await this.readState();
    const currentState = this.resourceState(state, id);
    const provider = this.providerFor(resource);
    await provider.rollback?.({
      manifest: resource,
      staged: currentState.stagedManifest,
      previousVersion: currentState.previousVersion,
      state: currentState
    });
    await this.writeResourceState(state, id, {
      ...currentState,
      status: currentState.previousVersion ? "ready" : "missing",
      installedVersion: currentState.previousVersion,
      stagedVersion: undefined,
      stagedManifest: undefined,
      previousVersion: undefined,
      lastUpdatedAt: new Date().toISOString(),
      lastError: undefined
    });
    const overview = await this.getOverview();
    await this.publishCompleted(id, "rollback", "completed", `${resource.label} rollback completed.`, overview);
    return this.response(
      {
        id,
        action: "rollback"
      },
      "completed",
      `${resource.label} rollback completed.`,
      overview
    );
  }

  async remove(id: string): Promise<RuntimeActionResponse> {
    const { resource } = await this.resolveResourcePair(id);
    const state = await this.readState();
    const currentState = this.resourceState(state, id);
    await this.providerFor(resource).remove?.({
      manifest: resource,
      state: currentState
    });
    await this.writeResourceState(state, id, {
      status: "missing",
      lastUpdatedAt: new Date().toISOString()
    });
    const overview = await this.getOverview();
    await this.publishCompleted(id, "remove", "completed", `${resource.label} was removed.`, overview);
    return this.response(
      {
        id,
        action: "remove"
      },
      "completed",
      `${resource.label} was removed.`,
      overview
    );
  }

  private async prepareResource(
    id: string,
    action: "prepare" | "repair",
    seen: Set<string>
  ): Promise<RuntimeActionResponse> {
    if (seen.has(id)) {
      throw new Error(`Runtime resource dependency cycle includes ${id}.`);
    }
    seen.add(id);
    const { resource } = await this.resolveResourcePair(id);
    await this.assertSupported(resource);
    for (const dependencyId of resource.dependencies) {
      await this.prepareResource(dependencyId, "prepare", seen);
    }

    const state = await this.readState();
    const currentState = this.resourceState(state, id);
    const provider = this.providerFor(resource);
    await this.publishProgress(id, action, "checking", `Checking ${resource.label}.`, 5);
    const inspection = await provider.inspect({
      manifest: resource,
      state: currentState
    });
    if (inspection.ready && inspectionMatchesDesiredVersion(inspection.version, currentState, resource) && (!currentState.stagedVersion || currentState.status === "ready")) {
      await this.writeResourceState(state, id, {
        ...currentState,
        status: "ready",
        installedVersion: inspection.version ?? currentState.installedVersion ?? resource.version,
        activePath: inspection.activePath ?? currentState.activePath ?? resource.activePath,
        lastCheckedAt: new Date().toISOString(),
        lastError: undefined
      });
      const overview = await this.getOverview();
      await this.publishCompleted(id, action, "completed", `${resource.label} is ready.`, overview);
      return this.response(
        {
          id,
          action
        },
        "completed",
        `${resource.label} is ready.`,
        overview
      );
    }

    await this.publishProgress(id, action, "resolving-source", `Choosing ${resource.label} install source.`, 15);
    const source = await this.resolveSource(resource);
    if (source.artifact?.sha256) {
      await this.publishProgress(id, action, "verifying-artifact", `Verifying ${resource.label} artifact.`, 35);
      await verifyArtifactDigest(source.artifact);
    }
    await this.publishProgress(id, action, "installing", `Preparing ${resource.label}.`, 55);
    const result =
      action === "repair" && provider.repair
        ? await provider.repair({
            manifest: resource,
            source: source.source,
            artifact: source.artifact,
            state: currentState
          })
        : await provider.prepare({
            manifest: resource,
            source: source.source,
            artifact: source.artifact,
            state: currentState
          });
    const nextState = await this.readState();
    await this.writeResourceState(nextState, id, {
      ...this.resourceState(nextState, id),
      status: "ready",
      installedVersion: result.version ?? resource.version,
      activePath: result.activePath ?? resource.activePath,
      source: source.source,
      downloadJobId: source.downloadJobId,
      lastCheckedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      lastError: undefined
    });
    const overview = await this.getOverview();
    await this.publishCompleted(id, action, "completed", result.summary, overview);
    return this.response(
      {
        id,
        action
      },
      "completed",
      result.summary,
      overview
    );
  }

  private async buildResourceOverview(
    resource: RuntimeResourceManifest,
    update: RuntimeResourceManifest | undefined,
    state: RuntimeManagerState,
    checkedAt: string
  ): Promise<RuntimeResourceOverview> {
    const resourceState = this.resourceState(state, resource.id);
    const provider = this.providers.get(resource.id);
    const inspection = provider
      ? await provider.inspect({
          manifest: resource,
          state: resourceState
        })
      : undefined;
    const bundledAvailable = await hasUsableBundledArtifact(resource);
    const installedVersion = resourceState.installedVersion ?? inspection?.version;
    const status =
      resourceState.status ??
      (inspection?.ready
        ? "ready"
        : inspection?.installed
          ? "installed"
          : bundledAvailable
            ? "bundled-available"
            : "missing");
    const latestApprovedVersion =
      resourceState.latestApprovedVersion ??
      (update?.version !== installedVersion ? update?.version : undefined) ??
      packagedDesiredUpdateVersion(resource, installedVersion);

    return {
      id: resource.id as RuntimeResourceId,
      kind: toOverviewKind(resource.kind),
      label: resource.label,
      status,
      sourcePolicy: resource.sourcePolicy,
      updatePolicy: resource.updatePolicy,
      installedVersion,
      bundledVersion: bundledAvailable ? resource.version : undefined,
      desiredVersion: resource.version,
      latestApprovedVersion,
      stagedVersion: resourceState.stagedVersion,
      activePath: resourceState.activePath ?? inspection?.activePath ?? resource.activePath,
      downloadJobId: resourceState.downloadJobId,
      updateAvailable: Boolean(resourceState.stagedVersion ?? latestApprovedVersion),
      blockingResourceIds: resource.dependencies.map((dependencyId) => dependencyId as RuntimeResourceId),
      summary:
        resourceState.lastError && (status === "failed" || status === "rollback-required")
          ? `${resource.label} needs repair.`
          : inspection?.summary ?? resource.summary ?? `${resource.label} is ${status}.`,
      detail:
        resourceState.lastError ??
        inspection?.detail ??
        resource.detail ??
        "ChillClaw manages this prerequisite through the runtime manifest.",
      lastCheckedAt: resourceState.lastCheckedAt ?? checkedAt,
      lastUpdatedAt: resourceState.lastUpdatedAt,
      lastError: resourceState.lastError
    };
  }

  private async resolveResourcePair(id: string): Promise<{
    resource: RuntimeResourceManifest;
    update?: RuntimeResourceManifest;
  }> {
    const [manifest, updateManifest] = await Promise.all([this.options.loadManifest(), this.loadUpdateManifest()]);
    const resource = manifest.resources.find((candidate) => candidate.id === id);
    if (!resource) {
      throw new Error(`Unknown runtime resource ${id}.`);
    }
    return {
      resource,
      update: updateManifest.resources.find((candidate) => candidate.id === id)
    };
  }

  private providerFor(resource: RuntimeResourceManifest): RuntimeResourceProvider {
    const provider = this.providers.get(resource.id);
    if (!provider) {
      throw new Error(`No runtime provider registered for ${resource.id}.`);
    }
    return provider;
  }

  private async resolveSource(resource: RuntimeResourceManifest): Promise<{
    source: RuntimeSourcePolicy;
    artifact?: RuntimeArtifactManifest;
    downloadJobId?: string;
  }> {
    for (const source of resource.sourcePolicy) {
      const candidates = resource.artifacts.filter((artifact) => artifact.source === source);
      for (const artifact of candidates) {
        if (await artifactUsable(artifact)) {
          if (artifact.url && this.options.downloadArtifact) {
            const downloaded = await this.options.downloadArtifact({ resource, artifact });
            return {
              source,
              artifact: downloaded.artifact,
              downloadJobId: downloaded.jobId
            };
          }
          return {
            source,
            artifact
          };
        }
      }
      if (candidates.length === 0 && source !== "bundled") {
        return {
          source
        };
      }
    }
    const fallbackSource = resource.sourcePolicy[0];
    if (!fallbackSource) {
      throw new Error(`${resource.label} does not define an install source.`);
    }
    return {
      source: fallbackSource
    };
  }

  private async assertSupported(resource: RuntimeResourceManifest): Promise<void> {
    if (resource.platforms.length === 0) {
      return;
    }
    const supported = resource.platforms.some((platform) => {
      const osMatches = !platform.os || platform.os === "*" || platform.os === process.platform || platform.os === "macos" && process.platform === "darwin";
      const archMatches = !platform.arch || platform.arch === "*" || platform.arch === process.arch;
      return osMatches && archMatches;
    });
    if (!supported) {
      throw new Error(`${resource.label} is not supported on this platform.`);
    }
  }

  private resourceState(state: RuntimeManagerState | undefined, id: string): RuntimeResourceStoredState {
    return state?.resources[id] ?? {
      status: "missing"
    };
  }

  private async readState(): Promise<RuntimeManagerState> {
    return (await this.options.readState()) ?? {
      resources: {}
    };
  }

  private async writeResourceState(
    state: RuntimeManagerState | undefined,
    id: string,
    resourceState: RuntimeResourceStoredState
  ): Promise<void> {
    await this.options.writeState({
      checkedAt: new Date().toISOString(),
      resources: {
        ...(state?.resources ?? {}),
        [id]: resourceState
      }
    });
  }

  private async loadUpdateManifest(): Promise<RuntimeManifestDocument> {
    return this.options.loadUpdateManifest
      ? await this.options.loadUpdateManifest()
      : {
          resources: []
        };
  }

  private async publishProgress(
    id: string,
    action: RuntimeAction,
    phase: RuntimeJobPhase,
    message: string,
    percent?: number
  ): Promise<void> {
    if (!this.options.publishProgress) {
      return;
    }
    await this.options.publishProgress({
      resourceId: id as RuntimeResourceId,
      action,
      phase,
      percent,
      message,
      runtimeManager: await this.getOverview()
    });
  }

  private async publishCompleted(
    id: string,
    action: RuntimeAction,
    status: "completed" | "failed",
    message: string,
    runtimeManager: RuntimeManagerOverview
  ): Promise<void> {
    await this.options.publishCompleted?.({
      resourceId: id as RuntimeResourceId,
      action,
      status,
      message,
      runtimeManager
    });
  }

  private response(
    base: RuntimeActionBase,
    status: "completed" | "failed",
    message: string,
    runtimeManager: RuntimeManagerOverview
  ): RuntimeActionResponse {
    const resource = runtimeManager.resources.find((candidate) => candidate.id === base.id);
    if (!resource) {
      throw new Error(`Runtime resource ${base.id} missing from overview.`);
    }
    this.revision += 1;
    return {
      epoch: this.epoch,
      revision: this.revision,
      settled: true,
      action: base.action,
      status,
      message,
      resource,
      runtimeManager
    };
  }
}

function packagedDesiredUpdateVersion(
  resource: RuntimeResourceManifest,
  installedVersion: string | undefined
): string | undefined {
  return installedVersion && installedVersion !== resource.version ? resource.version : undefined;
}

function inspectionMatchesDesiredVersion(
  inspectionVersion: string | undefined,
  state: RuntimeResourceStoredState,
  resource: RuntimeResourceManifest
): boolean {
  return (inspectionVersion ?? state.installedVersion) === resource.version;
}

async function artifactUsable(artifact: RuntimeArtifactManifest): Promise<boolean> {
  if (artifact.path) {
    try {
      await access(artifact.path);
      return true;
    } catch {
      return false;
    }
  }
  return Boolean(artifact.url);
}

async function hasUsableBundledArtifact(resource: RuntimeResourceManifest): Promise<boolean> {
  for (const artifact of resource.artifacts) {
    if (artifact.source === "bundled" && (await artifactUsable(artifact))) {
      return true;
    }
  }
  return false;
}

async function verifyArtifactDigest(artifact: RuntimeArtifactManifest): Promise<void> {
  if (!artifact.sha256 || !artifact.path) {
    return;
  }
  const file = await stat(artifact.path);
  if (!file.isFile()) {
    return;
  }
  const digest = await sha256File(artifact.path);
  if (digest !== artifact.sha256.toLowerCase()) {
    throw new Error(`Runtime artifact digest mismatch for ${artifact.path}.`);
  }
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

function toOverviewKind(kind: RuntimeResourceManifest["kind"]): RuntimeResourceKind {
  return kind === "other" ? "local-ai-backend" : kind;
}
