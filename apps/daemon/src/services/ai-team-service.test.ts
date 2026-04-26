import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { AIMemberDetail, DeleteAIMemberRequest } from "@chillclaw/contracts";

import { MockAdapter } from "../engine/mock-adapter.js";
import { CapabilityService } from "./capability-service.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { AITeamService } from "./ai-team-service.js";
import { StateStore } from "./state-store.js";

function createService(testName: string, adapter = new MockAdapter(), options?: { withEvents?: boolean }) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  const bus = options?.withEvents ? new EventBusService() : undefined;
  const eventPublisher = bus ? new EventPublisher(bus) : undefined;
  const capabilityService = new CapabilityService(adapter, undefined, store, eventPublisher);

  return {
    adapter,
    store,
    service: new AITeamService(adapter, store, eventPublisher, capabilityService),
    capabilityService,
    bus
  };
}

function storedManagedMember(overrides?: Partial<AIMemberDetail>): AIMemberDetail {
  return {
    id: "staged-member",
    agentId: "chillclaw-member-ai-emp-20260426-175051",
    source: "chillclaw",
    hasManagedMetadata: true,
    name: "AI EMP",
    jobTitle: "Assistant",
    status: "ready",
    currentStatus: "Finishing workspace setup in the background.",
    activeTaskCount: 0,
    avatar: {
      presetId: "onboarding-builder",
      accent: "#97b5ea",
      emoji: "🧠",
      theme: "onboarding"
    },
    brain: {
      entryId: "mock-openai-gpt-4o-mini",
      label: "OpenAI GPT-4o Mini",
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini"
    },
    teamIds: [],
    bindingCount: 0,
    bindings: [],
    lastUpdatedAt: "2026-04-26T10:38:28.000Z",
    personality: "",
    soul: "",
    workStyles: [],
    presetSkillIds: ["research-brief", "status-writer"],
    skillIds: ["research-brief", "status-writer"],
    knowledgePackIds: ["company-handbook", "delivery-playbook"],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    },
    agentDir: "/mock/agents/chillclaw-member-ai-emp-20260426-175051",
    workspaceDir: "/mock/workspaces/staged-member",
    ...overrides
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
  await store.update((current) => ({
    ...current,
    setupCompletedAt: "2026-04-24T00:00:00.000Z"
  }));
  const overview = await service.getOverview();
  const state = await store.read();

  assert.equal(overview.members.length, 1);
  assert.equal(overview.members[0]?.agentId, "existing-agent");
  assert.equal(overview.members[0]?.source, "detected");
  assert.equal(overview.members[0]?.hasManagedMetadata, false);
  assert.equal(overview.members[0]?.avatar.emoji, "🧭");
  assert.equal(overview.members[0]?.bindingCount, 1);
  assert.equal(overview.memberPresets.length > 0, true);
  assert.equal(overview.memberPresets[0]?.skillIds.length > 0, true);
  assert.equal(state.aiTeam?.members[overview.members[0].id]?.agentId, "existing-agent");
});

test("AI team overview does not import ChillClaw-managed agents without stored metadata", async () => {
  class StaleManagedAgentsAdapter extends MockAdapter {
    override async listAIMemberRuntimeCandidates() {
      return [
        {
          agentId: "chillclaw-member-old-helper-20260411-000000",
          name: "Old Helper",
          emoji: "🧠",
          modelKey: "openai/gpt-4o-mini",
          agentDir: "/mock/old-helper/agent",
          workspaceDir: "/mock/old-helper/workspace",
          bindingCount: 0,
          bindings: []
        },
        {
          agentId: "chillclaw-member-current-helper-20260412-000000",
          name: "Current Helper",
          emoji: "🧠",
          modelKey: "openai/gpt-4o-mini",
          agentDir: "/mock/current-helper/agent",
          workspaceDir: "/mock/current-helper/workspace",
          bindingCount: 1,
          bindings: [{ id: "wechat:default", target: "wechat:default" }]
        },
        {
          agentId: "existing-openclaw-agent",
          name: "Existing OpenClaw Agent",
          emoji: "🧭",
          modelKey: "openai/gpt-4o-mini",
          agentDir: "/mock/existing-agent",
          workspaceDir: "/mock/existing-workspace",
          bindingCount: 0,
          bindings: []
        }
      ];
    }
  }

  const { service, store } = createService("ai-team-stale-managed-agents", new StaleManagedAgentsAdapter());
  await store.write({
    tasks: [],
    setupCompletedAt: "2026-04-24T00:00:00.000Z",
    aiTeam: {
      teamVision: "A helpful team.",
      members: {
        "current-member": {
          id: "current-member",
          agentId: "chillclaw-member-current-helper-20260412-000000",
          source: "chillclaw",
          hasManagedMetadata: true,
          name: "Current Helper",
          jobTitle: "Research assistant",
          status: "ready",
          currentStatus: "Ready for new assignments.",
          activeTaskCount: 0,
          avatar: {
            presetId: "onboarding-analyst",
            accent: "#97b5ea",
            emoji: "🧠",
            theme: "onboarding"
          },
          brain: {
            entryId: "mock-openai-gpt-4o-mini",
            label: "GPT-4o Mini",
            providerId: "openai",
            modelKey: "openai/gpt-4o-mini"
          },
          teamIds: [],
          bindingCount: 0,
          bindings: [],
          lastUpdatedAt: "2026-04-12T00:00:00.000Z",
          personality: "",
          soul: "",
          workStyles: [],
          skillIds: [],
          knowledgePackIds: [],
          capabilitySettings: {
            memoryEnabled: true,
            contextWindow: 128000
          },
          agentDir: "/mock/current-helper/agent",
          workspaceDir: "/mock/current-helper/workspace"
        }
      },
      teams: {},
      activity: []
    }
  });

  const overview = await service.getOverview();
  const state = await store.read();

  assert.deepEqual(
    overview.members.map((member) => member.agentId).sort(),
    ["chillclaw-member-current-helper-20260412-000000", "existing-openclaw-agent"]
  );
  assert.equal(overview.members.find((member) => member.id === "current-member")?.source, "chillclaw");
  assert.equal(state.aiTeam?.members["detected-chillclaw-member-old-helper-20260411-000000"], undefined);
});

test("AI team overview preserves managed members when runtime discovery misses them", async () => {
  class EmptyRuntimeAdapter extends MockAdapter {
    override async listAIMemberRuntimeCandidates() {
      return [];
    }
  }

  const { service, store } = createService("ai-team-preserve-managed-runtime-miss", new EmptyRuntimeAdapter());
  const member = storedManagedMember();
  await store.write({
    tasks: [],
    setupCompletedAt: "2026-04-26T10:38:28.000Z",
    aiTeam: {
      teamVision: "A helpful team.",
      members: {
        [member.id]: member
      },
      teams: {},
      activity: []
    }
  });

  const overview = await service.getOverview();
  const state = await store.read();

  assert.deepEqual(overview.members.map((item) => item.id), ["staged-member"]);
  assert.equal(overview.members[0]?.agentId, "chillclaw-member-ai-emp-20260426-175051");
  assert.equal(overview.members[0]?.brain?.entryId, "mock-openai-gpt-4o-mini");
  assert.equal(state.aiTeam?.members["staged-member"]?.agentId, "chillclaw-member-ai-emp-20260426-175051");
});

test("warmup snapshot publish does not drop a staged managed AI employee missing from runtime discovery", async () => {
  class EmptyRuntimeAdapter extends MockAdapter {
    override async listAIMemberRuntimeCandidates() {
      return [];
    }
  }

  const { service, store, bus } = createService("ai-team-warmup-preserve-managed-runtime-miss", new EmptyRuntimeAdapter(), {
    withEvents: true
  });
  const events: string[] = [];
  bus?.subscribe((event) => {
    events.push(event.type);
  });
  const member = storedManagedMember();
  await store.write({
    tasks: [],
    setupCompletedAt: "2026-04-26T10:38:28.000Z",
    aiTeam: {
      teamVision: "A helpful team.",
      members: {
        [member.id]: member
      },
      teams: {},
      activity: []
    }
  });

  await service.markOnboardingWarmupProgress("staged-member", "Finishing workspace setup.", "Still preparing workspace files.");

  const state = await store.read();
  const overview = await service.getOverview();

  assert.equal(state.aiTeam?.members["staged-member"]?.currentStatus, "Finishing workspace setup.");
  assert.equal(overview.members[0]?.id, "staged-member");
  assert.deepEqual(events, ["ai-team.updated"]);
});

test("AI team overview falls back to stored state when live runtime reads are slow", async () => {
  const { adapter, service, store } = createService("ai-team-live-read-timeout", new MockAdapter());
  const member = storedManagedMember();
  adapter.config.getModelConfig = async () => new Promise(() => undefined);
  adapter.config.getSkillRuntimeCatalog = async () => new Promise(() => undefined);
  adapter.aiEmployees.listAIMemberRuntimeCandidates = async () => new Promise(() => undefined);
  await store.write({
    tasks: [],
    setupCompletedAt: "2026-04-26T10:38:28.000Z",
    aiTeam: {
      teamVision: "A helpful team.",
      members: {
        [member.id]: member
      },
      teams: {},
      activity: []
    }
  });

  const startedAt = Date.now();
  const overview = await service.getOverview();
  const elapsedMs = Date.now() - startedAt;

  assert.equal(overview.members[0]?.id, "staged-member");
  assert.equal(overview.members[0]?.brain?.entryId, "mock-openai-gpt-4o-mini");
  assert.equal(elapsedMs < 2500, true);
});

test("AI team overview exposes daemon-owned member presets filtered to available skills", async () => {
  const { service } = createService("ai-team-member-presets", new MockAdapter());
  const overview = await service.getOverview();

  assert.deepEqual(
    overview.memberPresets.map((preset) => preset.id),
    ["general-assistant", "research-analyst", "ops-coordinator"]
  );
  assert.equal(overview.skillOptions.some((skill) => skill.id === "research-brief"), true);
  assert.equal(overview.skillOptions.some((skill) => skill.id === "status-writer"), true);
  assert.deepEqual(overview.memberPresets[0]?.knowledgePackIds, ["company-handbook", "delivery-playbook"]);
  assert.deepEqual(overview.memberPresets[1]?.skillIds, ["research-brief", "status-writer"]);
  assert.equal(overview.memberPresets[2]?.defaultMemoryEnabled, true);
});

test("saveMemberForOnboarding uses a resolved brain without live config reads when warmup is deferred", async () => {
  const { adapter, service } = createService("ai-team-onboarding-resolved-brain", new MockAdapter());
  let modelConfigReads = 0;
  let skillCatalogReads = 0;

  adapter.config.getModelConfig = async () => {
    modelConfigReads += 1;
    throw new Error("model config should not be read during deferred onboarding save");
  };
  adapter.config.getSkillRuntimeCatalog = async () => {
    skillCatalogReads += 1;
    throw new Error("skill catalog should not be read during deferred onboarding save");
  };

  const result = await service.saveMemberForOnboarding(
    undefined,
    {
      name: "AI Ryo",
      jobTitle: "Research Analyst",
      avatar: {
        presetId: "onboarding-analyst",
        accent: "#97b5ea",
        emoji: "🧠",
        theme: "onboarding"
      },
      brainEntryId: "runtime:ollama-gemma4-e2b",
      personality: "Analytical",
      soul: "Analytical",
      workStyles: ["Analytical"],
      presetSkillIds: ["research-brief"],
      skillIds: [],
      knowledgePackIds: ["company-handbook"],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      }
    },
    {
      deferWarmup: true,
      resolvedBrain: {
        entryId: "runtime:ollama-gemma4-e2b",
        label: "Local AI on this Mac",
        providerId: "ollama",
        modelKey: "ollama/gemma4:e2b"
      }
    }
  );

  assert.equal(result.member.brain?.entryId, "runtime:ollama-gemma4-e2b");
  assert.equal(result.member.brain?.modelKey, "ollama/gemma4:e2b");
  assert.equal(modelConfigReads, 0);
  assert.equal(skillCatalogReads, 0);
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

test("AI team service publishes snapshot events for member and team mutations", async () => {
  const { service, bus } = createService("ai-team-events", new MockAdapter(), { withEvents: true });
  const events: string[] = [];
  bus?.subscribe((event) => {
    events.push(event.type);
  });

  const created = await service.saveMember(undefined, {
    name: "Jordan Lee",
    jobTitle: "Support Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    brainEntryId: "mock-openai-gpt-4o-mini",
    personality: "Calm",
    soul: "Help clearly.",
    workStyles: [],
    skillIds: [],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  });

  const member = created.overview.members[0];
  await service.saveTeam(undefined, {
    name: "Support",
    purpose: "Handle user questions",
    memberIds: [member.id]
  });
  await service.deleteMember(member.id, { deleteMode: "keep-workspace" });

  assert.deepEqual(events, [
    "ai-team.updated",
    "ai-team.updated",
    "ai-team.updated"
  ]);
});

test("AI team save rejects skill ids that are not verified in the active runtime", async () => {
  const { service } = createService("ai-team-missing-skills", new MockAdapter());

  await assert.rejects(
    () =>
      service.saveMember(undefined, {
        name: "Jordan Lee",
        jobTitle: "Support Lead",
        avatar: {
          presetId: "operator",
          accent: "var(--avatar-1)",
          emoji: "🦊",
          theme: "sunrise"
        },
        brainEntryId: "mock-openai-gpt-4o-mini",
        personality: "Calm",
        soul: "Help clearly.",
        workStyles: [],
        skillIds: ["research-brief", "missing-skill"],
        knowledgePackIds: [],
        capabilitySettings: {
          memoryEnabled: true,
          contextWindow: 128000
        }
      }),
    /not verified in the active OpenClaw runtime/i
  );
});

test("AI team binding rehomes a channel away from the previous member", async () => {
  const { service } = createService("ai-team-binding-rehome", new MockAdapter());

  const first = await service.saveMember(undefined, {
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
  const second = await service.saveMember(undefined, {
    name: "Jordan Lee",
    jobTitle: "Support Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    brainEntryId: "mock-openai-gpt-4o-mini",
    personality: "Calm",
    soul: "Help clearly.",
    workStyles: [],
    skillIds: [],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  });

  const firstMember = first.overview.members.find((member) => member.name === "Alex Morgan")!;
  const secondMember = second.overview.members.find((member) => member.name === "Jordan Lee")!;

  await service.bindMemberChannel(firstMember.id, { binding: "telegram:default" });
  await service.bindMemberChannel(secondMember.id, { binding: "telegram:default" });

  const overview = await service.getOverview();
  const reboundFirst = overview.members.find((member) => member.id === firstMember.id)!;
  const reboundSecond = overview.members.find((member) => member.id === secondMember.id)!;

  assert.deepEqual(reboundFirst.bindings, []);
  assert.deepEqual(reboundSecond.bindings.map((binding) => binding.target), ["telegram:default"]);
});

test("AI team save resolves preset skill ids through daemon-owned preset verification", async () => {
  class PresetSkillReadyAdapter extends MockAdapter {
    private presetReady = false;

    override async installManagedSkill(_request: import("../engine/adapter.js").ManagedSkillInstallRequest) {
      this.presetReady = true;
      return {
        runtimeSkillId: "research-brief",
        version: "1.0.0",
        requiresGatewayApply: false
      };
    }

    override async verifyManagedSkill(slug: string) {
      if (!this.presetReady || slug !== "research-brief") {
        return undefined;
      }

      return {
        id: "research-brief",
        slug,
        name: "Research Brief",
        description: "Create concise research summaries with findings, risks, and next steps.",
        source: "openclaw-workspace",
        bundled: true,
        eligible: true,
        disabled: false,
        blockedByAllowlist: false,
        missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
        version: "1.0.0"
      };
    }
  }

  const { service, capabilityService } = createService("ai-team-preset-skill-request", new PresetSkillReadyAdapter());
  await capabilityService.setDesiredPresetSkillIds("test", ["research-brief"]);

  const created = await service.saveMember(undefined, {
    name: "Jordan Lee",
    jobTitle: "Support Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    brainEntryId: "mock-openai-gpt-4o-mini",
    personality: "Calm",
    soul: "Help clearly.",
    workStyles: [],
    presetSkillIds: ["research-brief"],
    skillIds: [],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    }
  });

  assert.deepEqual(created.overview.members[0]?.skillIds, ["research-brief"]);
  assert.deepEqual(created.overview.members[0]?.presetSkillIds, ["research-brief"]);
});

test("AI team member presets preserve curated preset skill ids alongside runtime skill ids", async () => {
  const { service } = createService("ai-team-member-preset-provenance", new MockAdapter());
  const overview = await service.getOverview();

  assert.deepEqual(overview.memberPresets[0]?.presetSkillIds, ["research-brief", "status-writer"]);
  assert.deepEqual(overview.memberPresets[0]?.skillIds, ["research-brief", "status-writer"]);
});
