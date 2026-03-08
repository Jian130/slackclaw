export type EngineKind = "openclaw" | "zeroclaw" | "ironclaw";

export type Severity = "ok" | "info" | "warning" | "error";
export type RecoverySafety = "safe" | "review" | "destructive";
export type RecoveryActionType =
  | "restart-engine"
  | "repair-config"
  | "rollback-update"
  | "reinstall-engine"
  | "export-diagnostics";

export interface EngineCapabilities {
  engine: EngineKind;
  supportsInstall: boolean;
  supportsUpdate: boolean;
  supportsRecovery: boolean;
  supportsStreaming: boolean;
  runtimeModes: Array<"gateway" | "embedded" | "local-llm">;
  supportedChannels: string[];
  starterSkillCategories: string[];
  futureLocalModelFamilies: string[];
}

export interface EngineInstallSpec {
  engine: EngineKind;
  desiredVersion: string;
  installSource: "brew" | "bundle" | "manual" | "mock" | "npm-global";
  prerequisites: string[];
  installPath?: string;
}

export interface EngineStatus {
  engine: EngineKind;
  installed: boolean;
  running: boolean;
  version?: string;
  summary: string;
  lastCheckedAt: string;
}

export interface AppServiceStatus {
  mode: "launchagent" | "adhoc" | "unmanaged";
  installed: boolean;
  running: boolean;
  managedAtLogin: boolean;
  label?: string;
  summary: string;
  detail: string;
}

export interface HealthCheckResult {
  id: string;
  title: string;
  severity: Severity;
  summary: string;
  detail: string;
  remediationActionIds: string[];
}

export interface RecoveryAction {
  id: string;
  type: RecoveryActionType;
  title: string;
  description: string;
  safetyLevel: RecoverySafety;
  expectedImpact: string;
}

export interface EngineTaskRequest {
  prompt: string;
  profileId: string;
  templateId?: string;
}

export interface EngineTaskStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
}

export interface EngineTaskResult {
  taskId: string;
  title: string;
  status: "running" | "completed" | "failed";
  summary: string;
  output: string;
  nextActions: string[];
  startedAt: string;
  finishedAt?: string;
  steps: EngineTaskStep[];
}

export interface TaskTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  promptHint: string;
}

export interface UserProfile {
  id: string;
  name: string;
  description: string;
  defaultTemplateIds: string[];
}

export interface InstallCheck {
  id: string;
  label: string;
  status: "pending" | "passed" | "action-required";
  detail: string;
}

export interface ProductOverview {
  appName: string;
  appVersion: string;
  platformTarget: string;
  appService: AppServiceStatus;
  engine: EngineStatus;
  installSpec: EngineInstallSpec;
  capabilities: EngineCapabilities;
  installChecks: InstallCheck[];
  profiles: UserProfile[];
  templates: TaskTemplate[];
  healthChecks: HealthCheckResult[];
  recoveryActions: RecoveryAction[];
  recentTasks: EngineTaskResult[];
}

export interface InstallRequest {
  autoConfigure: boolean;
}

export interface InstallResponse {
  status: "installed" | "already-installed";
  message: string;
  engineStatus: EngineStatus;
  disposition?: "reused-existing" | "installed" | "reinstalled" | "onboarded";
  changed?: boolean;
  hadExisting?: boolean;
  pinnedVersion?: string;
  existingVersion?: string;
  actualVersion?: string;
}

export interface OnboardingSelection {
  profileId: string;
}

export interface RecoveryRunResponse {
  actionId: string;
  status: "completed" | "failed";
  message: string;
}

export interface AppServiceActionResponse {
  action: "install" | "restart" | "uninstall";
  status: "completed" | "failed";
  message: string;
  service: AppServiceStatus;
}

export const defaultProfiles: UserProfile[] = [
  {
    id: "email-admin",
    name: "Email & Admin",
    description: "Draft replies, summarize updates, and keep routine work moving.",
    defaultTemplateIds: ["summarize-thread", "draft-email"]
  },
  {
    id: "research",
    name: "Research",
    description: "Turn scattered notes and links into concise briefings.",
    defaultTemplateIds: ["research-brief", "meeting-summary"]
  },
  {
    id: "docs",
    name: "Docs & Writing",
    description: "Polish drafts, create first-pass memos, and organize information.",
    defaultTemplateIds: ["rewrite-plain", "status-update"]
  }
];

export const defaultTemplates: TaskTemplate[] = [
  {
    id: "summarize-thread",
    title: "Summarize a thread",
    category: "Communication",
    description: "Condense a long conversation into a short action-oriented summary.",
    promptHint: "Paste the thread and tell SlackClaw who the summary is for."
  },
  {
    id: "draft-email",
    title: "Draft a reply",
    category: "Communication",
    description: "Write a professional response with a clear next step.",
    promptHint: "Paste the incoming email and describe the tone you want."
  },
  {
    id: "research-brief",
    title: "Research brief",
    category: "Research",
    description: "Turn notes into a structured brief with key findings and risks.",
    promptHint: "List the topic, audience, and your raw notes."
  },
  {
    id: "meeting-summary",
    title: "Meeting summary",
    category: "Operations",
    description: "Convert meeting notes into decisions, owners, and follow-ups.",
    promptHint: "Paste notes or transcript excerpts."
  },
  {
    id: "rewrite-plain",
    title: "Rewrite in plain language",
    category: "Writing",
    description: "Make a draft easier for non-technical readers to understand.",
    promptHint: "Paste the draft and mention the target audience."
  },
  {
    id: "status-update",
    title: "Weekly status update",
    category: "Operations",
    description: "Create a concise update with wins, blockers, and next steps.",
    promptHint: "List what shipped, what is blocked, and what is next."
  }
];

export function createDefaultProductOverview(): ProductOverview {
  const now = new Date().toISOString();

  return {
    appName: "SlackClaw",
    appVersion: "0.1.0",
    platformTarget: "macOS first",
    appService: {
      mode: "unmanaged",
      installed: false,
      running: false,
      managedAtLogin: false,
      label: undefined,
      summary: "SlackClaw background service is not managed yet.",
      detail: "The packaged app can install a LaunchAgent for login-time startup."
    },
    engine: {
      engine: "openclaw",
      installed: false,
      running: false,
      version: undefined,
      summary: "OpenClaw is not installed yet.",
      lastCheckedAt: now
    },
    installSpec: {
      engine: "openclaw",
      desiredVersion: "2026.3.7",
      installSource: "npm-global",
      prerequisites: [
        "macOS 14 or newer",
        "Permission to access local documents you choose",
        "Roughly 2 GB of free disk space",
        "Ability to install or reuse the pinned OpenClaw CLI"
      ]
    },
    capabilities: {
      engine: "openclaw",
      supportsInstall: true,
      supportsUpdate: true,
      supportsRecovery: true,
      supportsStreaming: true,
      runtimeModes: ["gateway", "embedded", "local-llm"],
      supportedChannels: ["local-ui"],
      starterSkillCategories: ["communication", "research", "docs", "operations"],
      futureLocalModelFamilies: ["qwen", "minimax", "llama", "mistral", "custom-openai-compatible"]
    },
    installChecks: [
      {
        id: "platform",
        label: "Supported macOS version",
        status: "pending",
        detail: "SlackClaw will check your OS version on first launch."
      },
      {
        id: "disk",
        label: "Free disk space",
        status: "pending",
        detail: "SlackClaw will verify enough space for the engine and starter assets."
      },
      {
        id: "permissions",
        label: "Document access permission",
        status: "pending",
        detail: "Needed only when you explicitly select files or folders."
      }
    ],
    profiles: defaultProfiles,
    templates: defaultTemplates,
    healthChecks: [
      {
        id: "engine-service",
        title: "Engine service",
        severity: "warning",
        summary: "OpenClaw is not running yet.",
        detail: "Install SlackClaw's bundled OpenClaw setup to enable tasks.",
        remediationActionIds: ["reinstall-engine"]
      },
      {
        id: "config",
        title: "Configuration",
        severity: "info",
        summary: "Default profile has not been selected.",
        detail: "Complete onboarding so SlackClaw can apply sane defaults.",
        remediationActionIds: ["repair-config"]
      }
    ],
    recoveryActions: [
      {
        id: "restart-engine",
        type: "restart-engine",
        title: "Restart assistant engine",
        description: "Safely restart the local engine service.",
        safetyLevel: "safe",
        expectedImpact: "Briefly interrupts active work while the engine restarts."
      },
      {
        id: "repair-config",
        type: "repair-config",
        title: "Repair setup defaults",
        description: "Restore the recommended profile and default SlackClaw settings.",
        safetyLevel: "safe",
        expectedImpact: "Keeps your history but resets product preferences to defaults."
      },
      {
        id: "rollback-update",
        type: "rollback-update",
        title: "Rollback last update",
        description: "Return to the last known compatible engine release.",
        safetyLevel: "review",
        expectedImpact: "May remove the newest engine update if it caused instability."
      },
      {
        id: "reinstall-engine",
        type: "reinstall-engine",
        title: "Reinstall engine",
        description: "Reinstall OpenClaw with SlackClaw's recommended version.",
        safetyLevel: "review",
        expectedImpact: "Rebuilds the engine installation without removing your task history."
      },
      {
        id: "export-diagnostics",
        type: "export-diagnostics",
        title: "Export diagnostics",
        description: "Create a support bundle with logs, versions, and health state.",
        safetyLevel: "safe",
        expectedImpact: "Creates a zip file you can share with support."
      }
    ],
    recentTasks: []
  };
}
