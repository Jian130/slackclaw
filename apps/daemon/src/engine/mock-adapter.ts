import { randomUUID } from "node:crypto";

import type {
  EngineCapabilities,
  EngineInstallSpec,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  RecoveryAction,
  RecoveryRunResponse
} from "@slackclaw/contracts";

import type { EngineAdapter } from "./adapter.js";

export class MockAdapter implements EngineAdapter {
  readonly installSpec: EngineInstallSpec = {
    engine: "openclaw",
    desiredVersion: "mock-compatible",
    installSource: "mock",
    prerequisites: ["None in mock mode"]
  };

  readonly capabilities: EngineCapabilities = {
    engine: "openclaw",
    supportsInstall: true,
    supportsUpdate: true,
    supportsRecovery: true,
    supportsStreaming: true,
    runtimeModes: ["gateway", "embedded", "local-llm"],
    supportedChannels: ["local-ui"],
    starterSkillCategories: ["communication", "research", "docs", "operations"],
    futureLocalModelFamilies: ["qwen", "minimax", "llama", "mistral", "custom-openai-compatible"]
  };

  private installed = true;
  private profileId = "email-admin";

  async install(): Promise<InstallResponse> {
    this.installed = true;
    return {
      status: "already-installed",
      message: "Mock adapter is ready for SlackClaw UI development.",
      engineStatus: await this.status()
    };
  }

  async configure(profileId: string): Promise<void> {
    this.profileId = profileId;
  }

  async status(): Promise<EngineStatus> {
    return {
      engine: "openclaw",
      installed: this.installed,
      running: this.installed,
      version: "mock",
      summary: "SlackClaw is running with a mock engine adapter.",
      lastCheckedAt: new Date().toISOString()
    };
  }

  async healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]> {
    return [
      {
        id: "engine-service",
        title: "Engine service",
        severity: "ok",
        summary: "Mock engine is ready.",
        detail: "This adapter keeps the UI usable before a real engine is connected.",
        remediationActionIds: []
      },
      {
        id: "default-profile",
        title: "Onboarding profile",
        severity: selectedProfileId ? "ok" : "info",
        summary: selectedProfileId ? "A default workflow profile is set." : "Choose a profile to finish onboarding.",
        detail: `Current mock default profile: ${this.profileId}.`,
        remediationActionIds: selectedProfileId ? [] : ["repair-config"]
      }
    ];
  }

  async runTask(request: EngineTaskRequest): Promise<EngineTaskResult> {
    return {
      taskId: randomUUID(),
      title: request.templateId ? `Mock ${request.templateId}` : "Mock task",
      status: "completed",
      summary: "Mock engine completed the task.",
      output: `Mock output for profile "${request.profileId}".\n\n${request.prompt}`,
      nextActions: ["Try a real engine", "Edit the task", "Export output"],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      steps: [
        { id: "prepare", label: "Preparing task", status: "done" },
        { id: "execute", label: "Generating mock output", status: "done" }
      ]
    };
  }

  async update(): Promise<{ message: string; engineStatus: EngineStatus }> {
    return {
      message: "Mock engine is always on the recommended version.",
      engineStatus: await this.status()
    };
  }

  async repair(action: RecoveryAction): Promise<RecoveryRunResponse> {
    return {
      actionId: action.id,
      status: "completed",
      message: `${action.title} completed in mock mode.`
    };
  }

  async exportDiagnostics(): Promise<{ filename: string; content: string }> {
    return {
      filename: "slackclaw-mock-diagnostics.json",
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          adapter: "mock",
          profileId: this.profileId
        },
        null,
        2
      )
    };
  }
}
