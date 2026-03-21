import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

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
