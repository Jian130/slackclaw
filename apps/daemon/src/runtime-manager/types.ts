import type {
  RuntimeAction,
  RuntimeJobPhase,
  RuntimeResourceId,
  RuntimeResourceKind,
  RuntimeResourceStatus,
  RuntimeSourcePolicy,
  RuntimeUpdatePolicy
} from "@chillclaw/contracts";

export type RuntimeManifestKind = RuntimeResourceKind | "other";
export type RuntimeArtifactFormat = "file" | "directory" | "tgz" | "zip" | "json";

export interface RuntimePlatformConstraint {
  os?: NodeJS.Platform | "*" | "macos";
  arch?: NodeJS.Architecture | "*";
  minimumVersion?: string;
}

export interface RuntimeArtifactManifest {
  source: RuntimeSourcePolicy;
  format: RuntimeArtifactFormat;
  path?: string;
  url?: string;
  sha256?: string;
  sizeBytes?: number;
}

export interface RuntimeResourceManifest {
  id: RuntimeResourceId | string;
  kind: RuntimeManifestKind;
  label: string;
  version: string;
  platforms: RuntimePlatformConstraint[];
  sourcePolicy: RuntimeSourcePolicy[];
  updatePolicy: RuntimeUpdatePolicy;
  installDir: string;
  activePath?: string;
  artifacts: RuntimeArtifactManifest[];
  dependencies: string[];
  summary?: string;
  detail?: string;
}

export interface RuntimeManifestDocument {
  schemaVersion?: number;
  generatedAt?: string;
  resources: RuntimeResourceManifest[];
}

export interface RuntimeResourceStoredState {
  status: RuntimeResourceStatus;
  installedVersion?: string;
  activePath?: string;
  stagedVersion?: string;
  stagedManifest?: RuntimeResourceManifest;
  previousVersion?: string;
  latestApprovedVersion?: string;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
  lastError?: string;
  source?: RuntimeSourcePolicy;
  downloadJobId?: string;
}

export interface RuntimeManagerState {
  checkedAt?: string;
  resources: Record<string, RuntimeResourceStoredState>;
}

export interface RuntimeProviderInspection {
  installed: boolean;
  ready: boolean;
  version?: string;
  activePath?: string;
  summary: string;
  detail: string;
  lastError?: string;
}

export interface RuntimeProviderActionResult {
  version?: string;
  activePath?: string;
  changed: boolean;
  summary: string;
  detail: string;
}

export interface RuntimeProviderPrepareContext {
  manifest: RuntimeResourceManifest;
  source: RuntimeSourcePolicy;
  artifact?: RuntimeArtifactManifest;
  state?: RuntimeResourceStoredState;
}

export interface RuntimeProviderStageUpdateContext {
  manifest: RuntimeResourceManifest;
  staged: RuntimeResourceManifest;
  source: RuntimeSourcePolicy;
  artifact?: RuntimeArtifactManifest;
  state?: RuntimeResourceStoredState;
}

export interface RuntimeProviderApplyUpdateContext {
  manifest: RuntimeResourceManifest;
  staged: RuntimeResourceManifest;
  previousVersion?: string;
  state?: RuntimeResourceStoredState;
}

export interface RuntimeProviderRollbackContext {
  manifest: RuntimeResourceManifest;
  staged?: RuntimeResourceManifest;
  previousVersion?: string;
  state?: RuntimeResourceStoredState;
  error?: unknown;
}

export interface RuntimeResourceProvider {
  id: string;
  inspect(context: { manifest: RuntimeResourceManifest; state?: RuntimeResourceStoredState }): Promise<RuntimeProviderInspection>;
  prepare(context: RuntimeProviderPrepareContext): Promise<RuntimeProviderActionResult>;
  repair?(context: RuntimeProviderPrepareContext): Promise<RuntimeProviderActionResult>;
  stageUpdate?(context: RuntimeProviderStageUpdateContext): Promise<RuntimeProviderActionResult>;
  applyUpdate(context: RuntimeProviderApplyUpdateContext): Promise<RuntimeProviderActionResult>;
  rollback?(context: RuntimeProviderRollbackContext): Promise<RuntimeProviderActionResult>;
  remove?(context: { manifest: RuntimeResourceManifest; state?: RuntimeResourceStoredState }): Promise<RuntimeProviderActionResult>;
}

export interface RuntimeManagerPublishProgressArgs {
  resourceId: RuntimeResourceId;
  action: RuntimeAction;
  phase: RuntimeJobPhase;
  percent?: number;
  message: string;
}

export interface RuntimeManagerPublishCompletedArgs {
  resourceId: RuntimeResourceId;
  action: RuntimeAction;
  status: "completed" | "failed";
  message: string;
}

export interface RuntimeManagerPublishUpdateStagedArgs {
  resourceId: RuntimeResourceId;
  version: string;
  message: string;
}
