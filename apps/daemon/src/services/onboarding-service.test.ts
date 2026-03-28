import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { OnboardingStateResponse } from "@slackclaw/contracts";

import type { SkillRuntimeEntry } from "../engine/adapter.js";
import { MockAdapter } from "../engine/mock-adapter.js";
import { AITeamService } from "./ai-team-service.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { OnboardingService } from "./onboarding-service.js";
import { OverviewService } from "./overview-service.js";
import { PresetSkillService } from "./preset-skill-service.js";
import { StateStore } from "./state-store.js";

function createRuntimeSkill(slug: string, version = "1.0.0"): SkillRuntimeEntry {
  return {
    id: `${slug}-runtime`,
    slug,
    name: slug,
    description: `${slug} skill.`,
    source: "openclaw-workspace",
    bundled: false,
    eligible: true,
    disabled: false,
    blockedByAllowlist: false,
    missing: {
      bins: [],
      anyBins: [],
      env: [],
      config: [],
      os: []
    },
    version,
    filePath: `/mock/skills/${slug}/SKILL.md`,
    baseDir: `/mock/skills/${slug}`
  };
}

function createService(testName: string) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store);

  return {
    adapter,
    store,
    service: new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService)
  };
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

test("onboarding completion clears the draft, marks setup completed, and returns a destination summary", async () => {
  const { service, store } = createService("onboarding-service-complete");

  await service.updateState({
    currentStep: "complete",
    install: {
      installed: true,
      version: "2026.3.13",
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
    },
    employee: {
      memberId: "member-1",
      name: "Alex Morgan",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst"
    }
  });

  const result = await service.complete({ destination: "chat" });
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(result.destination, "chat");
  assert.equal(result.overview.firstRun.setupCompleted, true);
  assert.equal(Boolean(state.setupCompletedAt), true);
  assert.equal(state.onboarding, undefined);
  assert.equal(result.summary.channel?.channelId, "telegram");
  assert.equal(result.summary.employee?.name, "Alex Morgan");
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
    currentStep: "complete",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "installed-managed"
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
    currentStep: "complete",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "installed-managed"
    }
  });

  await assert.rejects(() => service.complete({ destination: "chat" }), /Gateway finalization failed/i);

  const state = await store.read();
  assert.equal(state.setupCompletedAt, undefined);
  assert.equal(state.onboarding?.draft.currentStep, "complete");
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
  assert.equal(state.config?.modelProviders?.[0]?.defaultModelKey, "minimax/MiniMax-M2.5");
  assert.deepEqual(state.config?.modelProviders?.[0]?.authMethods.map((method) => method.id), ["minimax-api"]);
  assert.equal(state.config?.modelProviders?.[1]?.defaultModelKey, "modelstudio/qwen3.5-plus");
  assert.deepEqual(state.config?.modelProviders?.[1]?.authMethods.map((method) => method.id), ["modelstudio-api-key-cn"]);
  assert.deepEqual(state.config?.modelProviders?.[2]?.authMethods.map((method) => method.id), ["openai-api-key", "openai-codex"]);
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
  assert.deepEqual(state.config?.employeePresets?.[0]?.presetSkillIds, ["research-brief", "status-writer"]);
  assert.deepEqual(state.config?.employeePresets?.[1]?.knowledgePackIds, ["customer-voice"]);
  assert.equal(state.config?.employeePresets?.[2]?.theme, "operator");
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

test("onboarding service does not re-run preset skill reconciliation when only employee profile fields change", async () => {
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

  assert.equal(reconcileCalls, 1);

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

  assert.equal(reconcileCalls, 1);
  assert.equal(updated.presetSkillSync?.targetMode, "reused-install");
  assert.equal(updated.presetSkillSync?.summary.includes("reused-install runtime"), true);
});

test("onboarding service returns pending preset skill sync immediately while reconciliation continues in the background", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/onboarding-service-background-preset-sync-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const channelSetupService = new ChannelSetupService(adapter, store);
  const presetSkillService = new PresetSkillService(adapter, store);
  const aiTeamService = new AITeamService(adapter, store, undefined, presetSkillService);
  const service = new OnboardingService(adapter, store, overviewService, channelSetupService, aiTeamService, presetSkillService);
  const installed = new Map<string, SkillRuntimeEntry>();
  let waitForFirstVerify = true;
  let releaseFirstVerify: (() => void) | undefined;
  const firstVerifyGate = new Promise<void>((resolve) => {
    releaseFirstVerify = resolve;
  });

  Object.assign(adapter.config, {
    installManagedSkill: async (request: { slug: string; version?: string }) => {
      const runtimeSkill = createRuntimeSkill(request.slug, request.version ?? "1.0.0");
      installed.set(request.slug, runtimeSkill);
      return {
        runtimeSkillId: runtimeSkill.id,
        version: runtimeSkill.version,
        requiresGatewayApply: true
      };
    },
    verifyManagedSkill: async (slug: string) => {
      if (!installed.has(slug) && waitForFirstVerify) {
        waitForFirstVerify = false;
        await firstVerifyGate;
      }

      return installed.get(slug);
    }
  });

  const updatePromise = service.updateState({
    currentStep: "employee",
    install: {
      installed: true,
      version: "2026.3.13",
      disposition: "reused-existing"
    },
    employee: {
      name: "Ryo-AI",
      jobTitle: "Research Analyst",
      avatarPresetId: "onboarding-analyst",
      presetId: "research-analyst",
      presetSkillIds: ["research-brief", "status-writer"]
    }
  });

  const raced = await Promise.race([
    updatePromise.then((value) => ({ kind: "resolved" as const, value })),
    delay(100).then(() => ({ kind: "timed-out" as const }))
  ]);

  releaseFirstVerify?.();
  if (raced.kind !== "resolved") {
    await updatePromise;
  }

  assert.equal(raced.kind, "resolved");
  if (raced.kind !== "resolved") {
    return;
  }

  assert.equal(raced.value.presetSkillSync?.summary, "2 preset skills are syncing on the reused-install runtime.");
  assert.deepEqual(
    raced.value.presetSkillSync?.entries.map((entry) => entry.status),
    ["pending", "pending"]
  );

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const persisted = await store.read();
    if (persisted.presetSkills?.syncOverview?.entries.every((entry) => entry.status === "verified")) {
      assert.equal(persisted.presetSkills.syncOverview.summary, "2 preset skills verified on the reused-install runtime.");
      return;
    }

    await delay(10);
  }

  assert.fail("Expected preset skill reconciliation to finish after the onboarding request returned.");
});
