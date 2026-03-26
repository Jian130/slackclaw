import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { OnboardingStateResponse } from "@slackclaw/contracts";

import { MockAdapter } from "../engine/mock-adapter.js";
import { AITeamService } from "./ai-team-service.js";
import { ChannelSetupService } from "./channel-setup-service.js";
import { OnboardingService } from "./onboarding-service.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";

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
    ["wechat", "feishu", "telegram"]
  );
  assert.deepEqual(
    state.config?.channels?.map((channel) => channel.label),
    ["WeChat Work", "Feishu", "Telegram"]
  );
  assert.equal(state.config?.channels?.[0]?.setupKind, "wechat-guided");
  assert.equal(state.config?.channels?.[1]?.setupKind, "feishu-guided");
  assert.equal(state.config?.channels?.[2]?.setupKind, "telegram-guided");
  assert.deepEqual(
    state.config?.employeePresets?.map((preset) => preset.id),
    ["research-analyst", "support-captain", "delivery-operator"]
  );
  assert.deepEqual(state.config?.employeePresets?.[0]?.skillIds, ["research-brief", "status-writer"]);
  assert.deepEqual(state.config?.employeePresets?.[1]?.knowledgePackIds, ["customer-voice"]);
  assert.equal(state.config?.employeePresets?.[2]?.theme, "operator");
});
