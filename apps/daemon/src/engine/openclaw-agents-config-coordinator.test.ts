import assert from "node:assert/strict";
import test from "node:test";

import type { MemberBindingSummary, ModelCatalogEntry } from "@chillclaw/contracts";

import type { AIMemberRuntimeRequest } from "./adapter.js";
import { AgentsConfigCoordinator } from "./openclaw-agents-config-coordinator.js";

type AgentsConfigAccess = ConstructorParameters<typeof AgentsConfigCoordinator>[0];

const localModelEntry = {
  id: "managed-ollama-entry",
  label: "Local AI on this Mac",
  providerId: "ollama",
  modelKey: "ollama/gemma4:e2b",
  agentDir: "",
  workspaceDir: "",
  authMethodId: "ollama-local",
  profileIds: []
};

const localModelCatalogEntry: ModelCatalogEntry = {
  key: "ollama/gemma4:e2b",
  name: "gemma4:e2b",
  input: "text",
  contextWindow: 131072,
  local: true,
  available: true,
  tags: ["default", "configured"],
  missing: false
};

function makeMemberRuntimeRequest(): AIMemberRuntimeRequest {
  return {
    memberId: "member-ollama",
    existingAgentId: "existing-agent",
    name: "AI EMP",
    jobTitle: "Assistant",
    avatar: {
      presetId: "onboarding-builder",
      accent: "var(--avatar-1)",
      emoji: "AI",
      theme: "onboarding"
    },
    personality: "Helpful and reliable",
    soul: "A dependable local assistant.",
    workStyles: ["Methodical"],
    skillIds: [],
    selectedSkills: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    },
    knowledgePacks: [],
    brain: {
      entryId: localModelEntry.id,
      label: localModelEntry.label,
      providerId: localModelEntry.providerId,
      modelKey: localModelEntry.modelKey
    }
  };
}

test("saveAIMemberRuntime keeps the resolved brain entry when model state changes during save", async () => {
  let savedModelReads = 0;
  let upsertedBrainEntryId: string | undefined;
  const binding: MemberBindingSummary = {
    id: "wechat:default",
    target: "wechat:default"
  };

  const access: AgentsConfigAccess = {
    async listAIMemberRuntimeCandidates() {
      return [];
    },
    async getPrimaryAIMemberAgentId() {
      return "existing-agent";
    },
    async setPrimaryAIMemberAgent() {
      return { requiresGatewayApply: true };
    },
    async readResolvedSavedModelState() {
      savedModelReads += 1;
      return savedModelReads === 1 ? { modelEntries: [localModelEntry] } : { modelEntries: [] };
    },
    async readAllModels() {
      return [localModelCatalogEntry];
    },
    resolveCatalogModelKey(_models, raw) {
      return raw?.trim() || undefined;
    },
    async listOpenClawAgents() {
      return [{ id: "existing-agent" }];
    },
    async ensureMemberAgent() {
      return {
        agentDir: "/tmp/chillclaw-member-agent",
        workspaceDir: "/tmp/chillclaw-member-workspace",
        created: false
      };
    },
    async setMemberIdentity() {},
    async writeMemberWorkspaceFiles() {},
    async runOpenClaw(args) {
      if (args[0] === "agents" && args[1] === "bindings") {
        return { code: 0, stdout: JSON.stringify([binding.target]), stderr: "" };
      }
      return { code: 0, stdout: "{}", stderr: "" };
    },
    async markGatewayApplyPending() {},
    invalidateReadCaches() {},
    toRuntimeBindingTarget(value) {
      return value;
    },
    async readOpenClawConfigSnapshot() {
      return {
        configPath: "/tmp/openclaw.json",
        config: {},
        status: {
          agentDir: "/tmp/chillclaw-main-agent"
        }
      };
    },
    async writeOpenClawConfigSnapshot() {},
    async getSavedSecret() {
      return undefined;
    },
    buildModelsCommandArgs(args) {
      return ["models", ...args];
    },
    async readAuthStore() {
      return {
        version: 1,
        profiles: {},
        usageStats: {},
        order: {},
        lastGood: {}
      };
    },
    async writeAuthStore() {},
    async upsertAgentConfigEntry(_configPath, _config, entry) {
      upsertedBrainEntryId = entry.id;
    },
    getMainOpenClawAgentDir() {
      return "/tmp/chillclaw-main-agent";
    },
    async readBindingsCache(_agentId, loader) {
      return loader();
    },
    invalidateMemberBindingCaches() {}
  };

  const coordinator = new AgentsConfigCoordinator(access);

  const result = await coordinator.saveAIMemberRuntime(makeMemberRuntimeRequest(), {
    performMemoryIndex: false,
    ensurePrimaryAgent: false
  });

  assert.equal(result.agentId, "existing-agent");
  assert.equal(upsertedBrainEntryId, localModelEntry.id);
  assert.equal(savedModelReads, 1);
});

test("saveAIMemberRuntime can stage a managed agent without live OpenClaw agent commands", async () => {
  let ensuredStageConfigOnly: boolean | undefined;
  let identityCalls = 0;
  let runOpenClawCalls = 0;
  let upsertedAgentId: string | undefined;

  const access: AgentsConfigAccess = {
    async listAIMemberRuntimeCandidates() {
      return [];
    },
    async getPrimaryAIMemberAgentId() {
      return undefined;
    },
    async setPrimaryAIMemberAgent() {
      throw new Error("primary agent should be set after onboarding handoff");
    },
    async readResolvedSavedModelState() {
      return { modelEntries: [localModelEntry] };
    },
    async readAllModels() {
      return [localModelCatalogEntry];
    },
    resolveCatalogModelKey(_models, raw) {
      return raw?.trim() || undefined;
    },
    async listOpenClawAgents() {
      throw new Error("live agent list should not be read during config-only staging");
    },
    async ensureMemberAgent(_memberId, _agentId, _brain, options) {
      ensuredStageConfigOnly = options?.stageConfigOnly;
      return {
        agentDir: "/tmp/chillclaw-member-agent",
        workspaceDir: "/tmp/chillclaw-member-workspace",
        created: true
      };
    },
    async setMemberIdentity() {
      identityCalls += 1;
    },
    async writeMemberWorkspaceFiles() {},
    async runOpenClaw() {
      runOpenClawCalls += 1;
      return { code: 0, stdout: "{}", stderr: "" };
    },
    async markGatewayApplyPending() {},
    invalidateReadCaches() {},
    toRuntimeBindingTarget(value) {
      return value;
    },
    async readOpenClawConfigSnapshot() {
      return {
        configPath: "/tmp/openclaw.json",
        config: {},
        status: {
          agentDir: "/tmp/chillclaw-main-agent"
        }
      };
    },
    async writeOpenClawConfigSnapshot() {},
    async getSavedSecret() {
      return undefined;
    },
    buildModelsCommandArgs(args) {
      return ["models", ...args];
    },
    async readAuthStore() {
      return {
        version: 1,
        profiles: {},
        usageStats: {},
        order: {},
        lastGood: {}
      };
    },
    async writeAuthStore() {},
    async upsertAgentConfigEntry(_configPath, _config, entry) {
      upsertedAgentId = entry.agentId;
    },
    getMainOpenClawAgentDir() {
      return "/tmp/chillclaw-main-agent";
    },
    async readBindingsCache(_agentId, loader) {
      return loader();
    },
    invalidateMemberBindingCaches() {}
  };

  const request = makeMemberRuntimeRequest();
  delete request.existingAgentId;
  const coordinator = new AgentsConfigCoordinator(access);

  const result = await coordinator.saveAIMemberRuntime(request, {
    performMemoryIndex: false,
    ensurePrimaryAgent: false,
    stageConfigOnly: true,
    skipBindingRead: true
  });

  assert.equal(ensuredStageConfigOnly, true);
  assert.equal(identityCalls, 0);
  assert.equal(runOpenClawCalls, 0);
  assert.equal(result.bindings.length, 0);
  assert.equal(result.agentId.startsWith("chillclaw-member-ai-emp-"), true);
  assert.equal(upsertedAgentId, result.agentId);
});
