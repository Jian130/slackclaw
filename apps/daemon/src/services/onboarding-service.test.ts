import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { ChannelConfigOverview, OnboardingStateResponse } from "@chillclaw/contracts";

import { MockAdapter } from "../engine/mock-adapter.js";
import { AITeamService } from "./ai-team-service.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { LocalModelRuntimeService } from "./local-model-runtime-service.js";
import { OnboardingService } from "./onboarding-service.js";
import { OverviewService } from "./overview-service.js";
import { PresetSkillService } from "./preset-skill-service.js";
import { StateStore } from "./state-store.js";

function createService(testName: string, options?: { withEvents?: boolean }) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const bus = options?.withEvents ? new EventBusService() : undefined;
  const eventPublisher = bus ? new EventPublisher(bus) : undefined;
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const presetSkillService = new PresetSkillService(adapter, store, eventPublisher);
  const aiTeamService = new AITeamService(adapter, store, eventPublisher, presetSkillService);

  return {
    adapter,
    store,
    bus,
    aiTeamService,
    presetSkillService,
    service: new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, presetSkillService, eventPublisher)
  };
}

async function waitForCondition(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 1000,
  intervalMs = 10
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  assert.fail(`Condition was not met within ${timeoutMs}ms.`);
}

test("onboarding service persists draft progress and uses full completion as the route gate", async () => {
  const { service, store } = createService("onboarding-service-draft");

  const initial = await service.getState();
  assert.equal(initial.draft.currentStep, "welcome");
  assert.equal(initial.firstRun.setupCompleted, false);

  const updated = await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    model: {
      providerId: "anthropic",
      modelKey: "anthropic/claude-opus-4-6",
      entryId: "entry-anthropic"
    }
  });

  assert.equal(updated.draft.currentStep, "model");
  assert.equal(updated.draft.install?.version, "2026.3.13");
  assert.equal(updated.draft.model?.entryId, "entry-anthropic");

  const persisted = await store.read();
  assert.equal(persisted.onboarding?.draft.currentStep, "model");
  assert.equal(persisted.setupCompletedAt, undefined);
});

test("installRuntime advances onboarding to permissions when the managed runtime is ready", async () => {
  const { service } = createService("onboarding-service-install-runtime-advances");

  const result = await service.installRuntime();

  assert.equal(result.status, "completed");
  assert.equal(result.onboarding?.draft.currentStep, "permissions");
  assert.equal(result.onboarding?.draft.install?.installed, true);
  assert.equal(result.onboarding?.summary.install?.installed, true);
});

test("installRuntime defaults onboarding installs to the managed local runtime", async () => {
  const { adapter, service } = createService("onboarding-service-install-runtime-managed-local");
  let installOptions: { forceLocal?: boolean } | undefined;

  adapter.install = async (_autoConfigure = true, options?: { forceLocal?: boolean }) => {
    installOptions = options;
    return {
      status: "installed",
      message: "Mock OpenClaw runtime is deployed and ready for onboarding.",
      engineStatus: await adapter.status()
    };
  };

  const result = await service.installRuntime();

  assert.equal(result.status, "completed");
  assert.equal(installOptions?.forceLocal, true);
});

test("updateRuntime advances onboarding to permissions when the managed runtime is ready", async () => {
  const { service } = createService("onboarding-service-update-runtime-advances");

  const result = await service.updateRuntime();

  assert.equal(result.status, "completed");
  assert.equal(result.onboarding?.draft.currentStep, "permissions");
  assert.equal(result.onboarding?.draft.install?.installed, true);
  assert.equal(result.onboarding?.summary.install?.installed, true);
});

test("saving the employee draft stays lightweight once the channel draft is already staged", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-employee-draft-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  Object.assign(channelSetupService, {
    async getConfigOverview() {
      throw new Error("Employee draft saves should not fetch the channel overview.");
    }
  });
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "employee",
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "staged",
          message: "WeChat is staged."
        }
      }
    }
  }));

  const result = await service.saveEmployeeDraft({
    name: "Alex Morgan",
    jobTitle: "Research Analyst",
    avatarPresetId: "onboarding-analyst"
  });

  assert.equal(result.draft.employee?.name, "Alex Morgan");
  assert.equal(result.draft.employee?.jobTitle, "Research Analyst");
  assert.equal(result.summary.channel?.entryId, "wechat:default");
});

test("onboarding state keeps the model step undecided even when a default model entry already exists", async () => {
  const { adapter, service } = createService("onboarding-service-model-step-stays-undecided");

  await adapter.config.createSavedModelEntry({
    label: "Local AI on this Mac",
    providerId: "ollama",
    methodId: "ollama-local",
    modelKey: "ollama/gemma4:e4b",
    values: {},
    makeDefault: true
  });

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    },
    model: undefined
  });

  const repaired = await service.getState();

  assert.equal(repaired.draft.model, undefined);
  assert.equal(repaired.summary.model, undefined);
});

test("channel-step onboarding state uses the staged draft summary without live rechecks", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-summary-parallel-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);
  let statusCalls = 0;
  let targetCalls = 0;
  let modelCalls = 0;
  let channelCalls = 0;

  adapter.instances.status = async () => {
    statusCalls += 1;
    throw new Error("Channel-step getState should not re-read engine status.");
  };
  adapter.instances.getDeploymentTargets = async () => {
    targetCalls += 1;
    throw new Error("Channel-step getState should not re-read deployment targets.");
  };
  adapter.config.getModelConfig = async () => {
    modelCalls += 1;
    throw new Error("Channel-step getState should not re-read model config.");
  };
  Object.assign(channelSetupService, {
    async getConfigOverview() {
      channelCalls += 1;
      throw new Error("Channel-step getState should not re-read channel config.");
    }
  });

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "channel",
        install: {
          installed: true,
          version: "2026.4.5",
          disposition: "reused-existing"
        },
        model: {
          providerId: "openai",
          modelKey: "openai/gpt-5",
          entryId: "entry-openai"
        },
        channel: {
          channelId: "telegram",
          entryId: "telegram:default"
        }
      }
    }
  }));

  const state = await service.getState();

  assert.deepEqual(state.summary, {
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-5",
      entryId: "entry-openai"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    }
  });
  assert.equal(statusCalls, 0);
  assert.equal(targetCalls, 0);
  assert.equal(modelCalls, 0);
  assert.equal(channelCalls, 0);
});

test("onboarding state repairs later steps from an already configured default model entry", async () => {
  const { adapter, service } = createService("onboarding-service-repair-later-model-step");

  await adapter.config.createSavedModelEntry({
    label: "Local AI on this Mac",
    providerId: "ollama",
    methodId: "ollama-local",
    modelKey: "ollama/gemma4:e4b",
    values: {},
    makeDefault: true
  });

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    },
    model: undefined
  });

  const repaired = await service.getState();

  assert.equal(repaired.draft.model?.providerId, "ollama");
  assert.equal(repaired.draft.model?.modelKey, "ollama/gemma4:e4b");
  assert.equal(repaired.summary.model?.entryId, repaired.draft.model?.entryId);
});

test("onboarding state sends later drafts back to the model step when the default cloud model is not reusable", async () => {
  const { adapter, service } = createService("onboarding-service-repair-later-cloud-model-step");

  Object.assign(adapter.config as object, {
    async canReuseSavedModelEntry(entryId: string) {
      assert.equal(entryId, "mock-openai-gpt-4o-mini");
      return false;
    }
  });

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    },
    model: undefined
  });

  const repaired = await service.getState();

  assert.equal(repaired.draft.currentStep, "model");
  assert.equal(repaired.draft.model, undefined);
  assert.equal(repaired.summary.model, undefined);
});

test("navigating from the local model step to the channel step recovers the managed local model entry", async () => {
  const { adapter, service } = createService("onboarding-service-navigate-local-model");

  await adapter.config.createSavedModelEntry({
    label: "Local AI on this Mac",
    providerId: "ollama",
    methodId: "ollama-local",
    modelKey: "ollama/gemma4:e2b",
    values: {},
    makeDefault: true
  });

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    },
    model: undefined
  });

  const updated = await service.navigateStep({ step: "channel" });

  assert.equal(updated.draft.currentStep, "channel");
  assert.equal(updated.draft.model?.providerId, "ollama");
  assert.equal(updated.draft.model?.modelKey, "ollama/gemma4:e2b");
  assert.ok(updated.draft.model?.entryId);
  assert.equal(updated.summary.model?.entryId, updated.draft.model?.entryId);
});

test("navigating from an already active local runtime to channels avoids live model config reads", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-navigate-local-runtime-lightweight-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  let modelConfigCalls = 0;
  adapter.config.getModelConfig = async () => {
    modelConfigCalls += 1;
    throw new Error("Local runtime navigation should not reload OpenClaw model config.");
  };
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  let localRuntimeCalls = 0;
  const localRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      return {
        supported: true,
        recommendation: "local" as const,
        supportCode: "supported" as const,
        status: "ready" as const,
        runtimeInstalled: true,
        runtimeReachable: true,
        modelDownloaded: true,
        activeInOpenClaw: true,
        chosenModelKey: "ollama/gemma4:e2b",
        summary: "Local AI is ready on this Mac.",
        detail: "OpenClaw is already pointed at the local Ollama runtime."
      };
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, undefined, undefined, localRuntimeService);

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    },
    model: undefined
  });

  const updated = await service.navigateStep({ step: "channel" });

  assert.equal(updated.draft.currentStep, "channel");
  assert.equal(updated.draft.model?.providerId, "ollama");
  assert.equal(updated.draft.model?.methodId, "ollama-local");
  assert.equal(updated.draft.model?.modelKey, "ollama/gemma4:e2b");
  assert.equal(updated.draft.model?.entryId, "runtime:ollama-gemma4-e2b");
  assert.equal(updated.summary.model?.entryId, "runtime:ollama-gemma4-e2b");
  assert.equal(localRuntimeCalls, 1);
  assert.equal(modelConfigCalls, 0);
});

test("onboarding state includes the daemon-owned local runtime for the model step", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-model-local-runtime-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  let localRuntimeCalls = 0;
  const localRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      return {
        supported: true,
        recommendation: "local" as const,
        supportCode: "supported" as const,
        status: "idle" as const,
        runtimeInstalled: false,
        runtimeReachable: false,
        modelDownloaded: false,
        activeInOpenClaw: false,
        summary: "Local AI is available on this Mac.",
        detail: "ChillClaw recommends a starter Ollama tier for this Apple Silicon Mac."
      };
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, undefined, undefined, localRuntimeService);

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    }
  });

  const state = await service.getState();

  assert.equal(state.draft.currentStep, "model");
  assert.equal(state.localRuntime?.recommendation, "local");
  assert.equal(state.localRuntime?.status, "idle");
  assert.equal(localRuntimeCalls, 1);
});

test("onboarding state skips local runtime probing outside the model step", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-non-model-lightweight-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  let localRuntimeCalls = 0;
  const localRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      throw new Error("Non-model onboarding reads should not fetch the local runtime.");
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, undefined, undefined, localRuntimeService);

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.4.5",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    }
  });

  const state = await service.getState();

  assert.equal(state.draft.currentStep, "channel");
  assert.equal(state.localRuntime, undefined);
  assert.equal(localRuntimeCalls, 0);
});

test("model-step onboarding state reuses the staged install summary instead of rechecking engine status", async () => {
  const { adapter, service } = createService("onboarding-service-model-step-install-summary");
  let statusCalls = 0;
  let deploymentTargetCalls = 0;
  const originalStatus = adapter.instances.status.bind(adapter.instances);
  const originalDeploymentTargets = adapter.instances.getDeploymentTargets.bind(adapter.instances);
  adapter.instances.status = async () => {
    statusCalls += 1;
    return originalStatus();
  };
  adapter.instances.getDeploymentTargets = async () => {
    deploymentTargetCalls += 1;
    return originalDeploymentTargets();
  };

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.4.6",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: new Date().toISOString()
    }
  });

  statusCalls = 0;
  deploymentTargetCalls = 0;

  const state = await service.getState();

  assert.equal(state.summary.install?.installed, true);
  assert.equal(state.summary.install?.version, "2026.4.6");
  assert.equal(statusCalls, 0);
  assert.equal(deploymentTargetCalls, 0);
});

test("saving the employee draft reuses the staged model snapshot without refetching model config", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-employee-model-lightweight-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  let modelConfigCalls = 0;
  const originalGetModelConfig = adapter.config.getModelConfig.bind(adapter.config);
  adapter.config.getModelConfig = async () => {
    modelConfigCalls += 1;
    return originalGetModelConfig();
  };
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "employee",
        model: {
          providerId: "openai",
          modelKey: "openai/gpt-4o-mini",
          entryId: "mock-openai-gpt-4o-mini"
        },
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "staged",
          message: "WeChat is staged."
        }
      }
    }
  }));

  const result = await service.saveEmployeeDraft({
    name: "Alex Morgan",
    jobTitle: "Research Analyst",
    avatarPresetId: "onboarding-analyst"
  });

  assert.equal(modelConfigCalls, 0);
  assert.equal(result.summary.model?.entryId, "mock-openai-gpt-4o-mini");
});

test("saving the employee draft preserves in-progress spaces while typing", async () => {
  const { service, store } = createService("onboarding-service-employee-draft-spacing");

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "employee",
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "staged",
          message: "WeChat is staged."
        }
      }
    }
  }));

  const result = await service.saveEmployeeDraft({
    name: "Research ",
    jobTitle: "Analyst ",
    avatarPresetId: "onboarding-analyst"
  });

  assert.equal(result.draft.employee?.name, "Research ");
  assert.equal(result.draft.employee?.jobTitle, "Analyst ");
});

test("saving the employee draft clears stale onboarding channel session state once the employee step is already active", async () => {
  const { service, store } = createService("onboarding-service-employee-stale-channel-session");

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "employee",
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "capturing",
          sessionId: "wechat:default:login",
          message: "Waiting for QR confirmation."
        },
        activeChannelSessionId: "wechat:default:login"
      }
    }
  }));

  const result = await service.saveEmployeeDraft({
    name: "Alex Morgan",
    jobTitle: "Research Analyst",
    avatarPresetId: "onboarding-analyst"
  });

  assert.equal(result.draft.channelProgress?.status, "staged");
  assert.equal(result.draft.activeChannelSessionId, undefined);
  assert.equal(result.summary.channel?.entryId, "wechat:default");
});

test("saving the employee draft promotes a deferred personal WeChat handoff even if the stored step still lingers on channel", async () => {
  const { service, store } = createService("onboarding-service-employee-deferred-wechat-handoff");

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "channel",
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "idle",
          message: "WeChat is saved for final gateway activation."
        },
        activeChannelSessionId: ""
      }
    }
  }));

  const result = await service.saveEmployeeDraft({
    name: "Alex Morgan",
    jobTitle: "Research Analyst",
    avatarPresetId: "onboarding-analyst"
  });

  assert.equal(result.draft.currentStep, "employee");
  assert.equal(result.draft.channelProgress?.status, "staged");
  assert.equal(result.draft.activeChannelSessionId, undefined);
  assert.equal(result.summary.channel?.entryId, "wechat:default");
});

test("saving the employee draft keeps the staged model snapshot untouched until final completion", async () => {
  const { service, store } = createService("onboarding-service-employee-model-remap");

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "employee",
        model: {
          providerId: "openai",
          modelKey: "openai/gpt-4o-mini",
          entryId: "stale-openai-entry"
        },
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "staged",
          message: "WeChat is staged."
        }
      }
    }
  }));

  const result = await service.saveEmployeeDraft({
    name: "Alex Morgan",
    jobTitle: "Research Analyst",
    avatarPresetId: "onboarding-analyst"
  });

  assert.equal(result.draft.model?.entryId, "stale-openai-entry");
  assert.equal(result.summary.model?.entryId, "stale-openai-entry");
});

test("completed personal WeChat login advances onboarding once the installer saves the channel", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-wechat-pairing-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const getConfigOverview = channelSetupService.getConfigOverview.bind(channelSetupService);
  Object.assign(channelSetupService, {
    async getSession() {
      const channelConfig = await getConfigOverview();
      return {
        session: {
          id: "wechat:default:login",
          channelId: "wechat",
          entryId: "wechat:default",
          status: "completed",
          message: "Installer finished. OpenClaw still needs pairing approval.",
          logs: ["Installer finished."]
        },
        channelConfig: {
          ...channelConfig,
          entries: [
            {
              id: "wechat:default",
              channelId: "wechat",
              label: "WeChat",
              status: "awaiting-pairing",
              summary: "Saved for final gateway activation.",
              detail: "ChillClaw will finish gateway activation after onboarding.",
              editableValues: {},
              maskedConfigSummary: [],
              pairingRequired: false,
              lastUpdatedAt: "2026-03-29T00:00:00.000Z"
            }
          ]
        }
      };
    }
  });
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "capturing",
      sessionId: "wechat:default:login",
      message: "Waiting for QR confirmation."
    },
    activeChannelSessionId: "wechat:default:login"
  });

  const result = await service.getChannelSession("wechat:default:login");

  const onboarding = result.onboarding;
  assert.ok(onboarding);
  if (!onboarding) {
    throw new Error("Expected onboarding state in the channel session response.");
  }
  assert.equal(onboarding.draft.currentStep, "employee");
  assert.equal(onboarding.draft.channelProgress?.status, "staged");
  assert.equal(onboarding.draft.activeChannelSessionId, undefined);
});

test("saving a model entry keeps the normalized live model key in the onboarding draft", async () => {
  const { service, store, adapter } = createService("onboarding-service-normalized-model-key");

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "model",
        install: {
          installed: true,
          version: "2026.3.29",
          disposition: "installed-managed"
        },
        permissions: {
          confirmed: true,
          confirmedAt: "2026-03-29T00:00:00.000Z"
        }
      }
    }
  }));

  adapter.config.createSavedModelEntry = async (request) => ({
    epoch: "mock-daemon",
    revision: 1,
    settled: true,
    status: "completed",
    message: "Saved",
    modelConfig: {
      providers: [],
      models: [],
      defaultModel: "minimax/MiniMax-M2.7",
      configuredModelKeys: ["minimax/MiniMax-M2.7"],
      savedEntries: [
        {
          id: "model-entry-1",
          label: "MiniMax M2.7",
          providerId: request.providerId,
          modelKey: "minimax/MiniMax-M2.7",
          agentId: "chillclaw-model-minimax",
          authMethodId: request.methodId,
          authModeLabel: "API key",
          profileLabel: "Default",
          isDefault: true,
          isFallback: false,
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z"
        }
      ],
      defaultEntryId: "model-entry-1",
      fallbackEntryIds: []
    }
  });

  const result = await service.saveModelEntry({
    label: "MiniMax",
    providerId: "minimax",
    modelKey: "minimax/MiniMax-M2.5",
    methodId: "minimax-api",
    values: {
      apiKey: "sk-test"
    },
    makeDefault: true,
    useAsFallback: false
  });

  const onboarding = result.onboarding;
  assert.ok(onboarding);
  if (!onboarding) {
    throw new Error("Expected onboarding state in the model save response.");
  }
  assert.equal(onboarding.draft.model?.entryId, "model-entry-1");
  assert.equal(onboarding.draft.model?.modelKey, "minimax/MiniMax-M2.7");
  assert.equal(onboarding.summary.model?.entryId, "model-entry-1");
});

test("saving the first onboarding model clears legacy fallback entries from the runtime chain", async () => {
  const { service, store, adapter } = createService("onboarding-service-clears-fallbacks");
  let fallbackCleared = false;

  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "model",
        install: {
          installed: true,
          version: "2026.3.29",
          disposition: "installed-managed"
        },
        permissions: {
          confirmed: true,
          confirmedAt: "2026-03-29T00:00:00.000Z"
        }
      }
    }
  }));

  adapter.config.createSavedModelEntry = async (request) => ({
    epoch: "mock-daemon",
    revision: 1,
    settled: true,
    status: "completed",
    message: "Saved",
    modelConfig: {
      providers: [],
      models: [],
      defaultModel: "minimax/MiniMax-M2.7",
      configuredModelKeys: ["minimax/MiniMax-M2.7", "anthropic/claude-sonnet-4-6"],
      savedEntries: [
        {
          id: "model-entry-1",
          label: "MiniMax M2.7",
          providerId: request.providerId,
          modelKey: "minimax/MiniMax-M2.7",
          agentId: "chillclaw-model-minimax",
          authMethodId: request.methodId,
          authModeLabel: "API key",
          profileLabel: "Default",
          isDefault: true,
          isFallback: false,
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z"
        },
        {
          id: "runtime:anthropic-claude-sonnet-4-6",
          label: "Anthropic Claude Sonnet 4.6",
          providerId: "anthropic",
          modelKey: "anthropic/claude-sonnet-4-6",
          agentId: "",
          authMethodId: undefined,
          authModeLabel: undefined,
          profileLabel: undefined,
          isDefault: false,
          isFallback: true,
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z"
        }
      ],
      defaultEntryId: "model-entry-1",
      fallbackEntryIds: ["runtime:anthropic-claude-sonnet-4-6"]
    }
  });
  adapter.config.replaceFallbackModelEntries = async (request) => {
    fallbackCleared = true;
    assert.deepEqual(request.entryIds, []);
    return {
      epoch: "mock-daemon",
      revision: 2,
      settled: true,
      status: "completed",
      message: "Fallbacks cleared",
      modelConfig: {
        providers: [],
        models: [],
        defaultModel: "minimax/MiniMax-M2.7",
        configuredModelKeys: ["minimax/MiniMax-M2.7"],
        savedEntries: [
          {
            id: "model-entry-1",
            label: "MiniMax M2.7",
            providerId: "minimax",
            modelKey: "minimax/MiniMax-M2.7",
            agentId: "chillclaw-model-minimax",
            authMethodId: "minimax-api",
            authModeLabel: "API key",
            profileLabel: "Default",
            isDefault: true,
            isFallback: false,
            createdAt: "2026-03-29T00:00:00.000Z",
            updatedAt: "2026-03-29T00:00:00.000Z"
          }
        ],
        defaultEntryId: "model-entry-1",
        fallbackEntryIds: []
      }
    };
  };

  const result = await service.saveModelEntry({
    label: "MiniMax",
    providerId: "minimax",
    modelKey: "minimax/MiniMax-M2.7",
    methodId: "minimax-api",
    values: {
      apiKey: "sk-test"
    },
    makeDefault: true,
    useAsFallback: false
  });

  assert.equal(fallbackCleared, true);
  assert.deepEqual(result.modelConfig.fallbackEntryIds, []);
});

test("onboarding completion clears the draft, marks setup completed, and returns a destination summary", async () => {
  const { service, store } = createService("onboarding-service-complete");

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    },
    employee: {
      memberId: "member-1",
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  const result = await service.complete({ destination: "chat" });
  await waitForCondition(async () => Boolean((await store.read()).setupCompletedAt));
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.destination, "chat");
  assert.equal(result.overview.firstRun.setupCompleted, true);
  assert.equal(Boolean(state.setupCompletedAt), true);
  assert.equal(state.onboarding, undefined);
  assert.equal(result.summary.channel?.channelId, "telegram");
  assert.equal(result.summary.employee?.name, "Alex Morgan");
});

test("skipping onboarding to the dashboard bypasses finalize requirements from an in-progress draft", async () => {
  class FinalizingAdapter extends MockAdapter {
    gatewayFinalizeCalls = 0;

    override async finalizeOnboardingSetup() {
      this.gatewayFinalizeCalls += 1;
      return super.finalizeOnboardingSetup();
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-skip-dashboard-${randomUUID()}.json`);
  const adapter = new FinalizingAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    }
  });

  const result = await service.complete({ destination: "dashboard" });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.destination, "dashboard");
  assert.equal(result.overview.firstRun.setupCompleted, true);
  assert.equal(adapter.gatewayFinalizeCalls, 0);
  assert.equal(state.onboarding, undefined);
});

test("skipping onboarding to the dashboard bypasses AI employee creation and gateway finalization even from the final step", async () => {
  class FinalizingAdapter extends MockAdapter {
    gatewayFinalizeCalls = 0;

    override async finalizeOnboardingSetup() {
      this.gatewayFinalizeCalls += 1;
      return super.finalizeOnboardingSetup();
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-skip-dashboard-final-step-${randomUUID()}.json`);
  const adapter = new FinalizingAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  let memberCreateCalls = 0;
  Object.assign(aiTeamService, {
    async saveMemberForOnboarding() {
      memberCreateCalls += 1;
      throw new Error("Skip onboarding should not create the AI employee.");
    }
  });
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged",
      message: "WeChat is staged."
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  const result = await service.complete({ destination: "dashboard" });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.destination, "dashboard");
  assert.equal(result.overview.firstRun.setupCompleted, true);
  assert.equal(memberCreateCalls, 0);
  assert.equal(adapter.gatewayFinalizeCalls, 0);
  assert.equal(state.onboarding, undefined);
});

test("onboarding completion rejects unreusable cloud model entries before creating the AI employee", async () => {
  const { adapter, service, aiTeamService } = createService("onboarding-service-complete-requires-reusable-model-auth");
  let memberCreateCalls = 0;

  Object.assign(adapter.config as object, {
    async canReuseSavedModelEntry(entryId: string) {
      assert.equal(entryId, "mock-openai-gpt-4o-mini");
      return false;
    }
  });
  Object.assign(aiTeamService, {
    async saveMemberForOnboarding() {
      memberCreateCalls += 1;
      throw new Error("Onboarding should reject unreusable model auth before creating the AI employee.");
    }
  });

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged",
      message: "WeChat is staged."
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  await assert.rejects(
    () => service.complete({ destination: "chat" }),
    /re-save the first model/i
  );
  assert.equal(memberCreateCalls, 0);
});

test("onboarding completion resolves stale local runtime model draft IDs before creating the AI employee", async () => {
  const { adapter, service, aiTeamService } = createService("onboarding-service-complete-stale-local-runtime-model");

  await adapter.config.upsertManagedLocalModelEntry({
    label: "Local AI on this Mac",
    providerId: "ollama",
    methodId: "ollama-local",
    modelKey: "ollama/gemma4:e2b",
    entryId: "runtime:ollama-gemma4-e2b"
  });

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.4.11",
      disposition: "installed-managed"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-04-11T00:00:00.000Z"
    },
    model: {
      providerId: "ollama",
      methodId: "ollama-local",
      modelKey: "ollama/gemma4:e2b",
      entryId: "a3d597e8-3a50-4ce9-8372-4fadcd903e00"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    }
  });

  const result = await service.complete({
    destination: "chat",
    employee: {
      name: "AI Ryo",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: [],
      knowledgePackIds: [],
      workStyles: ["Analytical"],
      memoryEnabled: true
    }
  });
  const team = await aiTeamService.getOverview();
  const member = team.members.find((entry) => entry.name === "AI Ryo");

  assert.equal(result.status, "completed");
  assert.equal(result.summary.model?.entryId, "runtime:ollama-gemma4-e2b");
  assert.equal(result.summary.employee?.name, "AI Ryo");
  assert.equal(member?.brain?.entryId, "runtime:ollama-gemma4-e2b");
});

test("onboarding completion binds the selected channel to the created AI employee", async () => {
  const { service, aiTeamService } = createService("onboarding-service-complete-binds-channel");

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    },
    employee: {
      memberId: "member-bind",
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  await service.complete({ destination: "chat" });
  const team = await aiTeamService.getOverview();
  const member = team.members.find((entry) => entry.id === "member-bind");

  assert.equal(member?.bindings.some((binding) => binding.target === "telegram:default"), true);
});

test("onboarding completion accepts the final employee payload inline and returns before warmup settles", async () => {
  const { bus, presetSkillService, service } = createService("onboarding-service-fast-handoff", { withEvents: true });
  const events: Array<{ taskId: string; status: string; message: string }> = [];
  bus?.subscribe((event) => {
    if (event.type === "task.progress") {
      events.push({
        taskId: event.taskId,
        status: event.status,
        message: event.message
      });
    }
  });

  let releaseWarmup!: () => void;
  const warmupGate = new Promise<void>((resolveWarmup) => {
    releaseWarmup = resolveWarmup;
  });
  const originalSetDesiredPresetSkillIds = presetSkillService.setDesiredPresetSkillIds.bind(presetSkillService);
  presetSkillService.setDesiredPresetSkillIds = async (...args) => {
    await warmupGate;
    return originalSetDesiredPresetSkillIds(...args);
  };

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    }
  });

  const result = await Promise.race([
    service.complete({
      destination: "chat",
      employee: {
        name: "Ryo-AI",
        jobTitle: "Research Analyst",
        avatarPresetId: "onboarding-analyst",
        presetId: "research-analyst",
        presetSkillIds: ["research-brief", "status-writer"],
        knowledgePackIds: ["company-handbook"],
        workStyles: ["Analytical"],
        memoryEnabled: true
      }
    }).then((response) => ({ kind: "result" as const, response })),
    new Promise<{ kind: "timeout" }>((resolveTimeout) => setTimeout(() => resolveTimeout({ kind: "timeout" }), 250))
  ]);

  assert.equal(result.kind, "result");
  assert.ok(result.response.warmupTaskId);
  assert.equal(result.response.summary.employee?.name, "Ryo-AI");
  assert.equal(events.some((event) => event.message === "Creating your AI employee"), true);
  assert.equal(events.some((event) => event.taskId === result.response.warmupTaskId), true);

  releaseWarmup();
});

test("onboarding warmup failures keep onboarding completed and mark the created member for repair", async () => {
  const { bus, presetSkillService, service, store } = createService("onboarding-service-warmup-failure", { withEvents: true });
  const taskStatuses: string[] = [];
  bus?.subscribe((event) => {
    if (event.type === "task.progress") {
      taskStatuses.push(`${event.status}:${event.message}`);
    }
  });

  presetSkillService.setDesiredPresetSkillIds = async () => {
    throw new Error("Preset skill verification failed.");
  };

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    }
  });

  const result = await service.complete({
    destination: "team",
    employee: {
      name: "Ryo-AI",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook"],
      workStyles: ["Analytical"],
      memoryEnabled: true
    }
  });

  await waitForCondition(async () => {
    const persisted = await store.read();
    const member = Object.values(persisted.aiTeam?.members ?? {}).find((entry) => entry.name === "Ryo-AI");
    return Boolean(member) && taskStatuses.some((entry) => entry.startsWith("failed:"));
  });

  const persisted = await store.read();
  const member = Object.values(persisted.aiTeam?.members ?? {}).find((entry) => entry.name === "Ryo-AI");

  assert.equal(result.status, "completed");
  assert.equal(persisted.onboarding, undefined);
  assert.match(member?.currentStatus ?? "", /repair|finish setup/i);
  assert.equal(taskStatuses.some((entry) => entry.startsWith("failed:")), true);
});

test("onboarding completion trusts installed deployment targets when status temporarily reports not installed", async () => {
  const { service, adapter } = createService("onboarding-service-complete-installed-target");
  const originalStatus = adapter.instances.status.bind(adapter.instances);

  adapter.instances.status = async () => ({
    ...(await originalStatus()),
    installed: false,
    running: false
  });

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  const result = await service.complete({ destination: "chat" });

  assert.equal(result.status, "completed");
  assert.equal(result.summary.install?.installed, true);
});

test("onboarding completion trusts the staged install when live probes temporarily lose all install evidence", async () => {
  const { service, adapter } = createService("onboarding-service-complete-staged-install-fallback");

  adapter.instances.status = async () => ({
    engine: "openclaw",
    installed: false,
    running: false,
    version: undefined,
    summary: "OpenClaw temporarily unavailable",
    lastCheckedAt: "2026-03-30T00:00:00.000Z",
    gatewayRunning: false,
    gatewayRouteSummary: "Gateway unavailable",
    gatewayBind: "loopback",
    gatewayPort: 0,
    tokenAuthEnabled: true,
    configPath: "~/.openclaw/openclaw.json"
  });
  adapter.instances.getDeploymentTargets = async () => ({
    checkedAt: "2026-03-30T00:00:00.000Z",
    targets: []
  });

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  const result = await service.complete({ destination: "chat" });

  assert.equal(result.status, "completed");
  assert.equal(result.summary.install?.installed, true);
  assert.equal(result.summary.install?.version, "2026.3.13");
});

test("missing onboarding channel sessions clear the stale session id before surfacing an error", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-missing-session-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  Object.assign(channelSetupService, {
    async getSession() {
      throw new Error("Channel session not found.");
    }
  });
  const presetSkillService = new PresetSkillService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store, undefined, presetSkillService);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, presetSkillService);

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "capturing",
      sessionId: "wechat:default:login",
      message: "Started WeChat login",
      requiresGatewayApply: false
    },
    activeChannelSessionId: "wechat:default:login"
  });

  await assert.rejects(() => service.getChannelSession("wechat:default:login"), /start the login again/i);

  const persisted = await store.read();
  assert.equal(persisted.onboarding?.draft.activeChannelSessionId, undefined);
  assert.equal(persisted.onboarding?.draft.channel?.channelId, "wechat");
  assert.equal(persisted.onboarding?.draft.channelProgress?.status, "idle");
});

test("missing personal WeChat sessions keep the saved channel staged and advance onboarding", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-missing-wechat-session-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const wechatConfig: ChannelConfigOverview = {
    baseOnboardingCompleted: true,
    capabilities: [],
    entries: [
      {
        id: "wechat:default",
        channelId: "wechat",
        label: "WeChat",
        status: "awaiting-pairing",
        summary: "Saved for final gateway activation.",
        detail: "ChillClaw will finish gateway activation after onboarding.",
        editableValues: {},
        maskedConfigSummary: [],
        pairingRequired: false,
        lastUpdatedAt: "2026-04-07T06:04:48.605Z"
      }
    ],
    gatewaySummary: "Gateway ready"
  };
  Object.assign(channelSetupService, {
    async getSession() {
      throw new Error("Channel session not found.");
    },
    async getConfigOverview() {
      return wechatConfig;
    }
  });
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.4.2",
      disposition: "installed-managed"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-04-07T05:59:00.000Z"
    },
    model: {
      providerId: "ollama",
      modelKey: "ollama/gemma4:e2b",
      methodId: "ollama-local",
      entryId: "ea84d532-304a-451a-a653-01a69787a3ea"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "capturing",
      sessionId: "wechat:default:login",
      message: "Waiting for QR confirmation."
    },
    activeChannelSessionId: "wechat:default:login"
  });

  await assert.rejects(() => service.getChannelSession("wechat:default:login"), /start the login again/i);

  const recovered = await service.getState();
  assert.equal(recovered.draft.currentStep, "employee");
  assert.equal(recovered.draft.channel?.entryId, "wechat:default");
  assert.equal(recovered.draft.channelProgress?.status, "staged");
  assert.equal(recovered.draft.channelProgress?.message, "Saved for final gateway activation.");
  assert.equal(recovered.draft.activeChannelSessionId, undefined);

  const persisted = await store.read();
  assert.equal(persisted.onboarding?.draft.currentStep, "employee");
  assert.equal(persisted.onboarding?.draft.channelProgress?.status, "staged");
});

test("onboarding state repairs a saved personal WeChat handoff back to the employee step", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-repair-wechat-handoff-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  Object.assign(channelSetupService, {
    async getConfigOverview() {
      return {
        baseOnboardingCompleted: true,
        capabilities: [],
        entries: [
          {
            id: "wechat:default",
            channelId: "wechat",
            label: "WeChat",
            status: "awaiting-pairing",
            summary: "WeChat login is staged and waiting for pairing.",
            detail: "Complete the remaining WeChat pairing steps before using chat.",
            editableValues: {},
            maskedConfigSummary: [],
            pairingRequired: false,
            lastUpdatedAt: "2026-04-07T06:04:48.605Z"
          }
        ],
        gatewaySummary: "Gateway ready"
      } satisfies ChannelConfigOverview;
    }
  });
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await store.update((state) => ({
    ...state,
    onboarding: {
      draft: {
        currentStep: "channel",
        install: {
          installed: true,
          version: "OpenClaw 2026.4.2 (d74a122)",
          disposition: "installed-managed"
        },
        permissions: {
          confirmed: true,
          confirmedAt: "2026-04-05T12:13:15.595Z"
        },
        model: {
          providerId: "ollama",
          modelKey: "ollama/gemma4:e2b",
          methodId: "ollama-local",
          entryId: "ea84d532-304a-451a-a653-01a69787a3ea"
        },
        channel: {
          channelId: "wechat",
          entryId: "wechat:default"
        },
        channelProgress: {
          status: "idle",
          message: "The channel login session ended. Start the login again."
        },
        activeChannelSessionId: ""
      }
    }
  }));

  const recovered = await service.getState();

  assert.equal(recovered.draft.currentStep, "employee");
  assert.equal(recovered.draft.channel?.entryId, "wechat:default");
  assert.equal(recovered.draft.channelProgress?.status, "staged");
  assert.equal(recovered.draft.channelProgress?.message, "WeChat login is staged and waiting for pairing.");

  const persisted = await store.read();
  assert.equal(persisted.onboarding?.draft.currentStep, "employee");
  assert.equal(persisted.onboarding?.draft.channelProgress?.status, "staged");
});

test("missing onboarding model auth sessions clear the stale session id and preserve saved model progress", async () => {
  const { service, store, adapter } = createService("onboarding-service-missing-model-session");
  Object.assign(adapter.config, {
    async getModelAuthSession() {
      throw new Error("Auth session not found.");
    }
  });

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    activeModelAuthSessionId: "auth-session-1"
  });

  await assert.rejects(() => service.getModelAuthSession("auth-session-1"), /sign-in session ended/i);

  const persisted = await store.read();
  assert.equal(persisted.onboarding?.draft.activeModelAuthSessionId, undefined);
  assert.equal(persisted.onboarding?.draft.model?.entryId, "mock-openai-gpt-4o-mini");
  assert.equal(persisted.onboarding?.draft.currentStep, "channel");
});

test("onboarding completion runs the dedicated runtime finalization step before marking setup complete", async () => {
  class FinalizingAdapter extends MockAdapter {
    gatewayFinalizeCalls = 0;

    override async finalizeOnboardingSetup() {
      this.gatewayFinalizeCalls += 1;
      return super.finalizeOnboardingSetup();
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-pending-gateway-${randomUUID()}.json`);
  const adapter = new FinalizingAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "installed-managed"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged"
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  const result = await service.complete({ destination: "chat" });

  assert.equal(adapter.gatewayFinalizeCalls, 1);
  assert.equal(result.overview.engine.pendingGatewayApply, false);
  assert.equal(result.overview.engine.running, true);
});

test("onboarding completion leaves the draft intact when runtime finalization fails", async () => {
  class FailingFinalizationAdapter extends MockAdapter {
    override async finalizeOnboardingSetup() {
      return Promise.reject(new Error("Gateway finalization failed."));
    }
  }

  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-finalization-failure-${randomUUID()}.json`);
  const adapter = new FailingFinalizationAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "installed-managed"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged"
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  await assert.rejects(() => service.complete({ destination: "chat" }), /Gateway finalization failed/i);

  const state = await store.read();
  assert.equal(state.setupCompletedAt, undefined);
  assert.equal(state.onboarding?.draft.currentStep, "employee");
});

test("onboarding completion creates the staged AI employee before clearing onboarding", async () => {
  const { service, store } = createService("onboarding-service-finalize-member");

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "installed-managed"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged"
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook", "delivery-playbook"],
      workStyles: ["Analytical", "Concise"],
      memoryEnabled: true
    }
  });

  const result = await service.complete({ destination: "team" });
  const persisted = await store.read();
  const storedMembers = Object.values(persisted.aiTeam?.members ?? {});
  const createdMember = storedMembers.find((member) => member.name === "Alex Morgan");

  assert.equal(result.status, "completed");
  assert.ok(createdMember);
  assert.equal(createdMember?.jobTitle, "Research Analyst");
  assert.equal(createdMember?.brain?.entryId, "mock-openai-gpt-4o-mini");
  assert.deepEqual(createdMember?.presetSkillIds, ["research-brief", "status-writer"]);
  assert.equal(persisted.onboarding, undefined);
});

test("onboarding completion repairs legacy employee-step drafts that lost earlier prerequisite fields", async () => {
  const { service } = createService("onboarding-service-repair-legacy-draft");

  await service.updateState({
    currentStep: "employee",
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged"
    },
    employee: {
      name: "Ai Ryo",
      jobTitle: "AI Assistant",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook", "delivery-playbook"],
      workStyles: ["Analytical", "Concise"],
      memoryEnabled: true
    }
  });

  const result = await service.complete({ destination: "chat" });

  assert.equal(result.status, "completed");
  assert.equal(result.destination, "chat");
  assert.equal(result.summary.install?.installed, true);
  assert.equal(result.summary.model?.entryId, "mock-openai-gpt-4o-mini");
  assert.equal(result.summary.employee?.name, "Ai Ryo");
});

test("onboarding completion repairs employee-step drafts that lost staged channel state", async () => {
  const { adapter, service, store } = createService("onboarding-service-repair-missing-channel");
  const mockChannels = adapter as unknown as {
    channels: Record<string, { status: string; summary: string; detail: string; lastUpdatedAt?: string }>;
  };
  const lastUpdatedAt = "2026-03-29T03:59:00.000Z";
  mockChannels.channels.wechat = {
    ...mockChannels.channels.wechat,
    status: "completed",
    summary: "Recovered WeChat runtime channel.",
    detail: "Mock OpenClaw still has the WeChat channel configured.",
    lastUpdatedAt
  };

  await store.update((state) => ({
    ...state,
    onboarding: {
      draft: {
        currentStep: "employee",
        install: {
          installed: true,
          version: "2026.3.13",
          disposition: "reused-existing"
        },
        permissions: {
          confirmed: true,
          confirmedAt: "2026-03-24T00:01:00.000Z"
        },
        model: {
          providerId: "openai",
          modelKey: "openai/gpt-4o-mini",
          entryId: "mock-openai-gpt-4o-mini"
        },
        employee: {
          name: "Ai Ryo",
          jobTitle: "AI Assistant",
          avatarPresetId: "onboarding-analyst",
          presetId: "research-analyst",
          presetSkillIds: ["research-brief", "status-writer"],
          knowledgePackIds: ["company-handbook", "delivery-playbook"],
          workStyles: ["Analytical", "Concise"],
          memoryEnabled: true
        }
      }
    }
  }));

  const result = await service.complete({ destination: "chat" });

  assert.equal(result.status, "completed");
  assert.equal(result.summary.channel?.channelId, "wechat");
  assert.equal(result.summary.channel?.entryId, "wechat:default");
});

test("onboarding completion tolerates stale channel session markers on the employee step", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-stale-channel-session-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  let channelOverviewCalls = 0;
  Object.assign(channelSetupService, {
    async getConfigOverview() {
      channelOverviewCalls += 1;
      throw new Error("Finalize should not require channel overview when employee-step channel draft is already selected.");
    }
  });
  const aiTeamService = new AITeamService(adapter, store);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService);

  await service.updateState(
    {
      currentStep: "employee",
      install: {
        installed: true,
        version: "2026.3.13",
        disposition: "reused-existing"
      },
      permissions: {
        confirmed: true,
        confirmedAt: "2026-03-24T00:01:00.000Z"
      },
      model: {
        providerId: "openai",
        modelKey: "openai/gpt-4o-mini",
        entryId: "mock-openai-gpt-4o-mini"
      },
      channel: {
        channelId: "wechat",
        entryId: "wechat:default"
      },
      channelProgress: {
        status: "capturing",
        sessionId: "wechat:default:login",
        message: "WeChat login is still running."
      },
      activeChannelSessionId: "wechat:default:login",
      employee: {
        name: "Ai Ryo",
        jobTitle: "AI Assistant",
        avatarPresetId: "onboarding-analyst",
        presetId: "research-analyst",
        presetSkillIds: ["research-brief", "status-writer"],
        knowledgePackIds: ["company-handbook", "delivery-playbook"],
        workStyles: ["Analytical", "Concise"],
        memoryEnabled: true
      }
    },
    { responseSummaryMode: "draft" }
  );

  const result = await service.complete({ destination: "chat" });

  assert.equal(result.status, "completed");
  assert.equal(result.summary.channel?.channelId, "wechat");
  assert.equal(result.summary.channel?.entryId, "wechat:default");
  assert.equal(channelOverviewCalls, 0);
});

test("onboarding completion avoids rebuilding expensive live summaries during finalize", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-fast-finalize-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  let modelConfigCalls = 0;
  let skillCatalogCalls = 0;
  let runtimeCandidateCalls = 0;
  const originalGetModelConfig = adapter.config.getModelConfig.bind(adapter.config);
  const originalGetSkillRuntimeCatalog = adapter.config.getSkillRuntimeCatalog.bind(adapter.config);
  const originalListAIMemberRuntimeCandidates =
    adapter.aiEmployees.listAIMemberRuntimeCandidates.bind(adapter.aiEmployees);
  adapter.config.getModelConfig = async () => {
    modelConfigCalls += 1;
    return originalGetModelConfig();
  };
  adapter.config.getSkillRuntimeCatalog = async () => {
    skillCatalogCalls += 1;
    return originalGetSkillRuntimeCatalog();
  };
  adapter.aiEmployees.listAIMemberRuntimeCandidates = async () => {
    runtimeCandidateCalls += 1;
    return originalListAIMemberRuntimeCandidates();
  };
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const presetSkillService = new PresetSkillService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store, undefined, presetSkillService);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, presetSkillService);

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "wechat",
      entryId: "wechat:default"
    },
    channelProgress: {
      status: "staged"
    },
    employee: {
      name: "Ai Ryo",
      jobTitle: "AI Assistant",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook", "delivery-playbook"],
      workStyles: ["Analytical", "Concise"],
      memoryEnabled: true
    }
  });

  modelConfigCalls = 0;
  skillCatalogCalls = 0;
  runtimeCandidateCalls = 0;

  await service.complete({ destination: "chat" });

  assert.equal(modelConfigCalls, 1);
  assert.equal(skillCatalogCalls, 1);
  assert.equal(runtimeCandidateCalls, 0);
});

test("onboarding service reuses install summary for step-only updates instead of rechecking engine status", async () => {
  const { adapter, service } = createService("onboarding-service-step-only-summary");
  let statusCalls = 0;
  const originalStatus = adapter.instances.status.bind(adapter.instances);
  adapter.instances.status = async () => {
    statusCalls += 1;
    return originalStatus();
  };

  await service.updateState({
    currentStep: "install",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    }
  });

  assert.equal(statusCalls, 1);

  const updated = await service.updateState({
    currentStep: "permissions"
  });

  assert.equal(updated.summary.install?.installed, true);
  assert.equal(updated.summary.install?.version, "2026.3.13");
  assert.equal(statusCalls, 1);
});

test("onboarding service reuses summary when clients send an unchanged draft snapshot for a step transition", async () => {
  const { adapter, service } = createService("onboarding-service-unchanged-draft-summary");
  let statusCalls = 0;
  let modelConfigCalls = 0;
  const originalStatus = adapter.instances.status.bind(adapter.instances);
  const originalModelConfig = adapter.config.getModelConfig.bind(adapter.config);
  adapter.instances.status = async () => {
    statusCalls += 1;
    return originalStatus();
  };
  adapter.config.getModelConfig = async () => {
    modelConfigCalls += 1;
    return originalModelConfig();
  };

  await service.updateState({
    currentStep: "model",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-5",
      entryId: "entry-openai"
    }
  });

  assert.equal(statusCalls, 1);
  assert.equal(modelConfigCalls, 1);

  const updated = await service.updateState({
    currentStep: "channel",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-5",
      entryId: "entry-openai"
    }
  });

  assert.equal(updated.draft.currentStep, "channel");
  assert.equal(updated.summary.model?.entryId, "entry-openai");
  assert.equal(statusCalls, 1);
  assert.equal(modelConfigCalls, 1);
});

test("onboarding summary remaps stale saved model entry ids to the live matching model entry", async () => {
  const { service } = createService("onboarding-service-stale-model-entry");

  const updated = await service.updateState({
    currentStep: "employee",
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "stale-entry-id"
    }
  });

  assert.equal(updated.draft.model?.entryId, "stale-entry-id");
  assert.equal(updated.summary.model?.entryId, "mock-openai-gpt-4o-mini");
  assert.equal(updated.summary.model?.providerId, "openai");
  assert.equal(updated.summary.model?.modelKey, "openai/gpt-4o-mini");
});

test("redo onboarding clears completion state and resets the draft without wiping workspace data", async () => {
  const { service, store } = createService("onboarding-service-reset");

  await store.write({
    selectedProfileId: "email-admin",
    introCompletedAt: "2026-03-24T00:00:00.000Z",
    setupCompletedAt: "2026-03-24T00:05:00.000Z",
    tasks: [],
    onboarding: {
      draft: {
        currentStep: "employee",
        install: {
          installed: true,
          version: "2026.3.13",
          disposition: "reused-existing"
        }
      }
    },
    chat: {
      threads: {
        "thread-1": {
          id: "thread-1",
          memberId: "member-1",
          agentId: "agent-1",
          sessionKey: "session-1",
          title: "Hello",
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z"
        }
      }
    }
  });

  const reset = await service.reset();
  const persisted = await store.read();

  assert.equal(reset.firstRun.setupCompleted, false);
  assert.equal(reset.draft.currentStep, "welcome");
  assert.equal(reset.summary.install, undefined);
  assert.equal(persisted.setupCompletedAt, undefined);
  assert.equal(persisted.onboarding?.draft.currentStep, "welcome");
  assert.ok(persisted.chat?.threads["thread-1"]);
});

test("onboarding state exposes the curated model providers for step 3", async () => {
  const { service } = createService("onboarding-service-curated-providers");

  const state = await service.getState() as OnboardingStateResponse & {
    config?: {
      modelProviders?: Array<{ id: string; label: string }>;
    };
  };

  assert.deepEqual(
    state.config?.modelProviders?.map((provider) => provider.id),
    ["minimax", "modelstudio", "openai"]
  );
  assert.deepEqual(
    state.config?.modelProviders?.map((provider) => provider.label),
    ["MiniMax", "Qwen (通义千问)", "ChatGPT"]
  );
  assert.equal(state.config?.modelProviders?.[0]?.defaultModelKey, "minimax/MiniMax-M2.7");
  assert.deepEqual(
    state.config?.modelProviders?.[0]?.authMethods.map((method) => method.id),
    ["minimax-api", "minimax-api-key-cn", "minimax-portal", "minimax-portal-cn"]
  );
  assert.equal(state.config?.modelProviders?.[1]?.defaultModelKey, "modelstudio/qwen3.5-plus");
  assert.deepEqual(
    state.config?.modelProviders?.[1]?.authMethods.map((method) => method.id),
    [
      "modelstudio-standard-api-key-cn",
      "modelstudio-standard-api-key",
      "modelstudio-api-key-cn",
      "modelstudio-api-key"
    ]
  );
  assert.deepEqual(state.config?.modelProviders?.[2]?.authMethods.map((method) => method.id), ["openai-api-key", "openai-codex"]);
  assert.equal(state.config?.modelProviders?.[2]?.authMethods[1]?.label, "OpenAI Codex OAuth");
  assert.deepEqual(
    state.config?.channels?.map((channel) => channel.id),
    ["wechat-work", "wechat", "feishu", "telegram"]
  );
  assert.deepEqual(
    state.config?.channels?.map((channel) => channel.label),
    ["WeChat Work (WeCom)", "WeChat", "Feishu", "Telegram"]
  );
  assert.deepEqual(
    state.config?.channels?.map((channel) => channel.setupKind),
    ["wechat-work-guided", "wechat-guided", "feishu-guided", "telegram-guided"]
  );
  assert.deepEqual(
    state.config?.employeePresets?.map((preset) => preset.id),
    ["research-analyst", "support-captain", "delivery-operator"]
  );
  assert.deepEqual(
    state.config?.employeePresets?.map((preset) => preset.avatarPresetId),
    ["onboarding-analyst", "onboarding-guide", "onboarding-builder"]
  );
  assert.deepEqual(state.config?.employeePresets?.[0]?.presetSkillIds, ["research-brief", "status-writer"]);
  assert.deepEqual(state.config?.employeePresets?.[1]?.knowledgePackIds, ["customer-voice"]);
  assert.equal(state.config?.employeePresets?.[2]?.theme, "operator");
});

test("onboarding service fails fast when onboarding config references a missing employee preset id", async () => {
  const onboardingConfigModule = await import("../config/onboarding-config.js");
  assert.throws(
    () =>
      onboardingConfigModule.buildOnboardingUiConfig({
        ...onboardingConfigModule.onboardingUiConfigSelection,
        employeePresetIds: ["research-analyst", "missing-preset-id"]
      }),
    /Unknown onboarding employee preset: missing-preset-id/i
  );
});

test("onboarding service migrates legacy preset skill ids out of the live draft shape", async () => {
  const { service, store } = createService("onboarding-service-legacy-preset-skills");

  await store.write({
    tasks: [],
    onboarding: {
      draft: {
        currentStep: "employee",
        employee: {
          name: "Alex Morgan",
          jobTitle: "Research Analyst",
          avatarPresetId: "onboarding-analyst",
          presetId: "research-analyst",
          skillIds: ["research-brief", "status-writer"]
        } as never
      }
    }
  });

  const state = await service.getState();

  assert.deepEqual(state.draft.employee?.presetSkillIds, ["research-brief", "status-writer"]);
  assert.equal("skillIds" in (state.draft.employee ?? {}), false);
});

test("onboarding service does not reconcile preset skills while editing the employee draft", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-preset-skill-reuse-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const presetSkillService = new PresetSkillService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store, undefined, presetSkillService);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, presetSkillService);

  let reconcileCalls = 0;
  const originalSetDesiredPresetSkillIds = presetSkillService.setDesiredPresetSkillIds.bind(presetSkillService);
  presetSkillService.setDesiredPresetSkillIds = async (...args) => {
    reconcileCalls += 1;
    return originalSetDesiredPresetSkillIds(...args);
  };

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    employee: {
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"]
    }
  });

  assert.equal(reconcileCalls, 0);

  const updated = await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    employee: {
      name: "Ryo-AI",
      jobTitle: "Assistant",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"]
    }
  });

  assert.equal(reconcileCalls, 0);
  assert.equal(updated.presetSkillSync?.summary, "No preset skills selected.");
});

test("onboarding completion schedules staged preset skills during background warmup", async () => {
  const { presetSkillService, service } = createService("onboarding-service-finalize-preset-sync");

  const reconcileCalls: Array<{
    scope: string;
    presetSkillIds: string[];
    waitForReconcile: boolean | undefined;
    targetMode: string | undefined;
  }> = [];
  const originalSetDesiredPresetSkillIds = presetSkillService.setDesiredPresetSkillIds.bind(presetSkillService);
  presetSkillService.setDesiredPresetSkillIds = async (scope, presetSkillIds, options) => {
    reconcileCalls.push({
      scope,
      presetSkillIds,
      waitForReconcile: options?.waitForReconcile,
      targetMode: options?.targetMode
    });
    return originalSetDesiredPresetSkillIds(scope, presetSkillIds, options);
  };

  await service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    permissions: {
      confirmed: true,
      confirmedAt: "2026-03-24T00:01:00.000Z"
    },
    model: {
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini",
      entryId: "mock-openai-gpt-4o-mini"
    },
    channel: {
      channelId: "telegram",
      entryId: "telegram:default"
    },
    channelProgress: {
      status: "staged",
      requiresGatewayApply: true
    },
    employee: {
      name: "Ryo-AI",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"]
    }
  });

  assert.equal(reconcileCalls.length, 0);

  await service.complete({ destination: "chat" });

  for (let attempt = 0; attempt < 20 && reconcileCalls.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(reconcileCalls.length, 1);
  assert.deepEqual(reconcileCalls[0], {
    scope: "onboarding",
    presetSkillIds: ["research-brief", "status-writer"],
    waitForReconcile: true,
    targetMode: "reused-install"
  });
});
