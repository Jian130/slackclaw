import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { DeleteAIMemberRequest } from "@slackclaw/contracts";

import { MockAdapter } from "../engine/mock-adapter.js";
import { AITeamService } from "./ai-team-service.js";
import { StateStore } from "./state-store.js";

function createService(testName: string, adapter = new MockAdapter()) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const store = new StateStore(filePath);

  return {
    adapter,
    store,
    service: new AITeamService(adapter, store)
  };
}

test("AI team overview merges detected existing OpenClaw agents", async () => {
  class PreconfiguredMockAdapter extends MockAdapter {
    override async listAIMemberRuntimeCandidates() {
      return [
        {
          agentId: "existing-agent",
          name: "Existing Agent",
          emoji: "🧭",
          modelKey: "openai/gpt-4o-mini",
          agentDir: "/mock/agents/existing-agent",
          workspaceDir: "/mock/workspaces/existing-agent",
          bindingCount: 1,
          bindings: [{ id: "telegram:default", target: "telegram:default" }]
        }
      ];
    }
  }

  const { service, store } = createService("ai-team-live-detect", new PreconfiguredMockAdapter());
  const overview = await service.getOverview();
  const state = await store.read();

  assert.equal(overview.members.length, 1);
  assert.equal(overview.members[0]?.agentId, "existing-agent");
  assert.equal(overview.members[0]?.source, "detected");
  assert.equal(overview.members[0]?.hasManagedMetadata, false);
  assert.equal(overview.members[0]?.avatar.emoji, "🧭");
  assert.equal(overview.members[0]?.bindingCount, 1);
  assert.equal(state.aiTeam?.members[overview.members[0].id]?.agentId, "existing-agent");
});

test("AI team delete passes keep-workspace mode through and removes team membership", async () => {
  class RecordingMockAdapter extends MockAdapter {
    deleteRequest?: DeleteAIMemberRequest;

    override async deleteAIMemberRuntime(
      agentId: string,
      request: DeleteAIMemberRequest
    ): Promise<{ requiresGatewayApply?: boolean }> {
      this.deleteRequest = request;
      return super.deleteAIMemberRuntime(agentId, request);
    }
  }

  const adapter = new RecordingMockAdapter();
  const { service, store } = createService("ai-team-delete-mode", adapter);
  const created = await service.saveMember(undefined, {
    name: "Alex Morgan",
    jobTitle: "Research Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    brainEntryId: "mock-openai-gpt-4o-mini",
    personality: "Analytical",
    soul: "Keep work clear and grounded.",
    workStyles: ["Methodical"],
    skillIds: ["research-brief"],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  });

  const member = created.overview.members[0];
  await service.saveTeam(undefined, {
    name: "Ops",
    purpose: "Handle operations",
    memberIds: [member.id]
  });

  const removed = await service.deleteMember(member.id, { deleteMode: "keep-workspace" });
  const state = await store.read();

  assert.equal(adapter.deleteRequest?.deleteMode, "keep-workspace");
  assert.equal(removed.message.includes("workspace/history was kept"), true);
  assert.equal(state.aiTeam?.members[member.id], undefined);
  assert.equal(state.aiTeam?.teams[Object.keys(state.aiTeam?.teams ?? {})[0]]?.memberIds.length, 0);
});
