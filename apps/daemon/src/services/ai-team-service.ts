import { randomUUID } from "node:crypto";

import type {
  AITeamActionResponse,
  AITeamActivityItem,
  AITeamOverview,
  BindAIMemberChannelRequest,
  BrainAssignment,
  DeleteAIMemberRequest,
  KnowledgePack,
  MemberBindingsResponse,
  SaveAIMemberRequest,
  SaveTeamRequest,
  SkillOption,
  TeamDetail
} from "@slackclaw/contracts";
import type { EngineAdapter } from "../engine/adapter.js";
import type { AIMemberRuntimeCandidate } from "../engine/adapter.js";
import { StateStore, type AITeamState } from "./state-store.js";

const DEFAULT_TEAM_VISION =
  "Build a small, reliable AI team that helps ordinary users get useful work done quickly.";

const DEFAULT_KNOWLEDGE_PACKS: KnowledgePack[] = [
  {
    id: "company-handbook",
    label: "Company handbook",
    description: "Operating principles, norms, and internal expectations.",
    content: `# Company handbook

- Prefer plain language over jargon.
- Confirm ownership, deadlines, and next steps.
- Escalate risks early and clearly.`
  },
  {
    id: "customer-voice",
    label: "Customer voice",
    description: "Tone and support standards for customer-facing work.",
    content: `# Customer voice

- Be concise, calm, and respectful.
- Start by clarifying what changed or what is blocked.
- End with the clearest next step available.`
  },
  {
    id: "delivery-playbook",
    label: "Delivery playbook",
    description: "Execution defaults for briefs, updates, and routine operations.",
    content: `# Delivery playbook

- Summarize the request before acting.
- Break work into concrete milestones.
- Surface blockers with recommended recovery actions.`
  }
];

function defaultAITeamState(): AITeamState {
  return {
    teamVision: DEFAULT_TEAM_VISION,
    members: {},
    teams: {},
    activity: []
  };
}

function detectedMemberId(agentId: string): string {
  const slug = agentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `detected-${slug || "agent"}`;
}

function defaultMemberAvatar(emoji?: string) {
  return {
    presetId: "operator",
    accent: "var(--avatar-1)",
    emoji: emoji?.trim() || "🦊",
    theme: "sunrise"
  } as const;
}

function defaultBrainAssignment(
  candidate: AIMemberRuntimeCandidate,
  availableBrains: AITeamOverview["availableBrains"]
): BrainAssignment | undefined {
  const matched = availableBrains.find((entry) => entry.modelKey === candidate.modelKey);

  if (matched) {
    return {
      entryId: matched.id,
      label: matched.label,
      providerId: matched.providerId,
      modelKey: matched.modelKey
    };
  }

  return undefined;
}

function importedMemberSummary(candidate: AIMemberRuntimeCandidate, overview: AITeamOverview, teams: TeamDetail[]) {
  const timestamp = new Date().toISOString();
  return {
    id: detectedMemberId(candidate.agentId),
    agentId: candidate.agentId,
    source: "detected" as const,
    hasManagedMetadata: false,
    name: candidate.name,
    jobTitle: "Imported OpenClaw agent",
    status: "ready" as const,
    currentStatus: candidate.modelKey
      ? `Detected from OpenClaw with ${candidate.modelKey}. Add SlackClaw details to manage it here.`
      : "Detected from OpenClaw. Add SlackClaw details to manage it here.",
    activeTaskCount: 0,
    avatar: defaultMemberAvatar(candidate.emoji),
    brain: defaultBrainAssignment(candidate, overview.availableBrains),
    teamIds: withTeamIds(detectedMemberId(candidate.agentId), teams),
    bindingCount: candidate.bindingCount,
    bindings: candidate.bindings,
    lastUpdatedAt: timestamp,
    personality: "",
    soul: "",
    workStyles: [],
    skillIds: [],
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    },
    agentDir: candidate.agentDir,
    workspaceDir: candidate.workspaceDir
  };
}

function buildBrainAssignment(brains: AITeamOverview["availableBrains"], brainEntryId: string): BrainAssignment {
  const entry = brains.find((item) => item.id === brainEntryId);

  if (!entry) {
    throw new Error("Choose a saved model entry from Configuration first.");
  }

  return {
    entryId: entry.id,
    label: entry.label,
    providerId: entry.providerId,
    modelKey: entry.modelKey
  };
}

function withTeamIds(memberId: string, teams: TeamDetail[]): string[] {
  return teams.filter((team) => team.memberIds.includes(memberId)).map((team) => team.id);
}

function activityItem(
  memberId: string | undefined,
  memberName: string | undefined,
  action: string,
  description: string,
  tone: AITeamActivityItem["tone"]
): AITeamActivityItem {
  return {
    id: randomUUID(),
    memberId,
    memberName,
    action,
    description,
    timestamp: "Just now",
    tone
  };
}

export class AITeamService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore
  ) {}

  async getOverview(): Promise<AITeamOverview> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const modelConfig = await this.adapter.config.getModelConfig();
    const runtimeSkills = await this.adapter.config.getSkillRuntimeCatalog();
    const teams = Object.values(aiTeam.teams).sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0) || left.name.localeCompare(right.name));
    const baseOverview = {
      teamVision: aiTeam.teamVision,
      members: [],
      teams,
      activity: aiTeam.activity,
      availableBrains: modelConfig.savedEntries,
      knowledgePacks: DEFAULT_KNOWLEDGE_PACKS,
      skillOptions: runtimeSkills.skills
        .filter((skill) => skill.eligible && !skill.disabled && !skill.blockedByAllowlist)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(
          (skill): SkillOption => ({
            id: skill.id,
            label: skill.name,
            description: skill.description
          })
        )
    } satisfies AITeamOverview;
    const runtimeMembers = await this.adapter.aiEmployees.listAIMemberRuntimeCandidates();
    const storedByAgentId = new Map(Object.values(aiTeam.members).map((member) => [member.agentId, member]));

    const members = runtimeMembers
      .map((candidate) => {
        const stored = storedByAgentId.get(candidate.agentId);
        const inferred = importedMemberSummary(candidate, baseOverview, teams);

        return {
          ...(stored ?? inferred),
          source: stored ? (stored.source ?? "slackclaw") : inferred.source,
          hasManagedMetadata: stored ? (stored.hasManagedMetadata ?? true) : inferred.hasManagedMetadata,
          name: stored?.name?.trim() || inferred.name,
          jobTitle: stored?.jobTitle?.trim() || inferred.jobTitle,
          currentStatus: stored?.currentStatus?.trim() || inferred.currentStatus,
          teamIds: withTeamIds((stored ?? inferred).id, teams),
          bindingCount: candidate.bindingCount || stored?.bindingCount || stored?.bindings.length || 0,
          bindings: stored?.bindings ?? inferred.bindings,
          brain: stored?.brain?.entryId ? stored.brain : inferred.brain,
          agentDir: candidate.agentDir ?? stored?.agentDir,
          workspaceDir: candidate.workspaceDir ?? stored?.workspaceDir
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const nextMembers = Object.fromEntries(members.map((member) => [member.id, member]));
    if (JSON.stringify(aiTeam.members) !== JSON.stringify(nextMembers)) {
      await this.store.update((current) => ({
        ...current,
        aiTeam: {
          ...(current.aiTeam ?? defaultAITeamState()),
          members: nextMembers,
          teams: (current.aiTeam ?? defaultAITeamState()).teams,
          activity: (current.aiTeam ?? defaultAITeamState()).activity,
          teamVision: (current.aiTeam ?? defaultAITeamState()).teamVision
        }
      }));
    }

    return {
      teamVision: aiTeam.teamVision,
      members,
      teams,
      activity: aiTeam.activity,
      availableBrains: modelConfig.savedEntries,
      knowledgePacks: DEFAULT_KNOWLEDGE_PACKS,
      skillOptions: baseOverview.skillOptions
    };
  }

  async saveMember(memberId: string | undefined, request: SaveAIMemberRequest): Promise<AITeamActionResponse> {
    if (!request.name.trim()) {
      throw new Error("AI member name is required.");
    }

    if (!request.jobTitle.trim()) {
      throw new Error("Job title is required.");
    }

    const overview = await this.getOverview();
    const id = memberId ?? randomUUID();
    const current = overview.members.find((member) => member.id === id);
    const brain = buildBrainAssignment(overview.availableBrains, request.brainEntryId);
    const knowledgePacks = DEFAULT_KNOWLEDGE_PACKS.filter((pack) => request.knowledgePackIds.includes(pack.id));
    const selectedSkills = overview.skillOptions.filter((skill) => request.skillIds.includes(skill.id));
    const runtime = await this.adapter.aiEmployees.saveAIMemberRuntime({
      memberId: id,
      existingAgentId: current?.agentId,
      name: request.name.trim(),
      jobTitle: request.jobTitle.trim(),
      avatar: request.avatar,
      personality: request.personality.trim(),
      soul: request.soul.trim(),
      workStyles: request.workStyles,
      skillIds: request.skillIds,
      selectedSkills,
      capabilitySettings: request.capabilitySettings,
      knowledgePacks,
      brain
    });

    await this.store.update((state) => {
      const currentState = state.aiTeam ?? defaultAITeamState();
      const nextMember = {
        id,
        agentId: runtime.agentId,
        source: "slackclaw" as const,
        hasManagedMetadata: true,
        name: request.name.trim(),
        jobTitle: request.jobTitle.trim(),
        status: "ready" as const,
        currentStatus: "Ready for new assignments.",
        activeTaskCount: current?.activeTaskCount ?? 0,
        avatar: request.avatar,
        brain,
        teamIds: withTeamIds(id, Object.values(currentState.teams)),
        bindingCount: runtime.bindings.length,
        bindings: runtime.bindings,
        lastUpdatedAt: new Date().toISOString(),
        personality: request.personality.trim(),
        soul: request.soul.trim(),
        workStyles: request.workStyles,
        skillIds: request.skillIds,
        knowledgePackIds: request.knowledgePackIds,
        capabilitySettings: request.capabilitySettings,
        agentDir: runtime.agentDir,
        workspaceDir: runtime.workspaceDir
      };

      return {
        ...state,
        aiTeam: {
          ...currentState,
          members: {
            ...currentState.members,
            [id]: nextMember
          },
          activity: [
            activityItem(
              id,
              nextMember.name,
              current ? "Updated AI member" : "Created AI member",
              current
                ? `${nextMember.name} was updated and synced to OpenClaw.`
                : `${nextMember.name} is ready and mapped to an OpenClaw agent.`,
              current ? "updated" : "assigned"
            ),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    return {
      status: "completed",
      message: current ? `${request.name.trim()} was updated.` : `${request.name.trim()} was created.`,
      overview: await this.getOverview(),
      requiresGatewayApply: runtime.requiresGatewayApply
    };
  }

  async deleteMember(memberId: string, request: DeleteAIMemberRequest): Promise<AITeamActionResponse> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const member = aiTeam.members[memberId];

    if (!member) {
      throw new Error("AI member not found.");
    }

    const result = await this.adapter.aiEmployees.deleteAIMemberRuntime(member.agentId, request);

    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      const nextMembers = { ...currentState.members };
      delete nextMembers[memberId];

      const nextTeams = Object.fromEntries(
        Object.entries(currentState.teams).map(([teamId, team]) => [
          teamId,
          {
            ...team,
            memberIds: team.memberIds.filter((id) => id !== memberId),
            memberCount: team.memberIds.filter((id) => id !== memberId).length,
            updatedAt: new Date().toISOString()
          }
        ])
      );

      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: nextMembers,
          teams: nextTeams,
          activity: [
            activityItem(
              member.id,
              member.name,
              "Removed AI member",
              request.deleteMode === "keep-workspace"
                ? `${member.name} was removed from SlackClaw and OpenClaw, and the workspace/history was kept in place.`
                : `${member.name} was removed from SlackClaw, OpenClaw, and the workspace/history.`,
              "updated"
            ),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    return {
      status: "completed",
      message:
        request.deleteMode === "keep-workspace"
          ? `${member.name} was removed and the workspace/history was kept.`
          : `${member.name} was removed.`,
      overview: await this.getOverview(),
      requiresGatewayApply: result.requiresGatewayApply
    };
  }

  async getMemberBindings(memberId: string): Promise<MemberBindingsResponse> {
    const overview = await this.getOverview();
    const member = overview.members.find((item) => item.id === memberId);

    if (!member) {
      throw new Error("AI member not found.");
    }

    const bindings = await this.adapter.aiEmployees.getAIMemberBindings(member.agentId);
    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      const existingMember = currentState.members[memberId];

      if (!existingMember) {
        return current;
      }

      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: {
            ...currentState.members,
            [memberId]: {
              ...existingMember,
              bindingCount: bindings.length,
              bindings,
              lastUpdatedAt: existingMember.lastUpdatedAt
            }
          }
        }
      };
    });

    return {
      memberId,
      bindings
    };
  }

  async bindMemberChannel(memberId: string, request: BindAIMemberChannelRequest): Promise<AITeamActionResponse> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const member = aiTeam.members[memberId];

    if (!member) {
      throw new Error("AI member not found.");
    }

    const result = await this.adapter.aiEmployees.bindAIMemberChannel(member.agentId, request);
    const bindings = result.bindings;
    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: {
            ...currentState.members,
            [memberId]: {
              ...currentState.members[memberId],
              bindingCount: bindings.length,
              bindings,
              lastUpdatedAt: new Date().toISOString()
            }
          },
          activity: [
            activityItem(memberId, member.name, "Bound channel", `${member.name} is now bound to ${request.binding}.`, "updated"),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    return {
      status: "completed",
      message: `${member.name} is now bound to ${request.binding}.`,
      overview: await this.getOverview(),
      requiresGatewayApply: result.requiresGatewayApply
    };
  }

  async unbindMemberChannel(memberId: string, request: BindAIMemberChannelRequest): Promise<AITeamActionResponse> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const member = aiTeam.members[memberId];

    if (!member) {
      throw new Error("AI member not found.");
    }

    const result = await this.adapter.aiEmployees.unbindAIMemberChannel(member.agentId, request);
    const bindings = result.bindings;
    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: {
            ...currentState.members,
            [memberId]: {
              ...currentState.members[memberId],
              bindingCount: bindings.length,
              bindings,
              lastUpdatedAt: new Date().toISOString()
            }
          },
          activity: [
            activityItem(memberId, member.name, "Unbound channel", `${member.name} is no longer bound to ${request.binding}.`, "updated"),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    return {
      status: "completed",
      message: `${member.name} is no longer bound to ${request.binding}.`,
      overview: await this.getOverview(),
      requiresGatewayApply: result.requiresGatewayApply
    };
  }

  async saveTeam(teamId: string | undefined, request: SaveTeamRequest): Promise<AITeamActionResponse> {
    if (!request.name.trim()) {
      throw new Error("Team name is required.");
    }

    const id = teamId ?? randomUUID();
    const now = new Date().toISOString();

    await this.store.update((current) => {
      const aiTeam = current.aiTeam ?? defaultAITeamState();
      const nextTeam: TeamDetail = {
        id,
        name: request.name.trim(),
        purpose: request.purpose.trim(),
        memberIds: [...new Set(request.memberIds)],
        memberCount: [...new Set(request.memberIds)].length,
        displayOrder: request.displayOrder,
        updatedAt: now
      };

      return {
        ...current,
        aiTeam: {
          ...aiTeam,
          teams: {
            ...aiTeam.teams,
            [id]: nextTeam
          }
        }
      };
    });

    return {
      status: "completed",
      message: `${request.name.trim()} was saved.`,
      overview: await this.getOverview()
    };
  }

  async deleteTeam(teamId: string): Promise<AITeamActionResponse> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();

    if (!aiTeam.teams[teamId]) {
      throw new Error("AI team not found.");
    }

    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      const nextTeams = { ...currentState.teams };
      const deleted = nextTeams[teamId];
      delete nextTeams[teamId];

      return {
        ...current,
        aiTeam: {
          ...currentState,
          teams: nextTeams,
          activity: deleted
            ? [
                activityItem(undefined, undefined, "Deleted AI team", `${deleted.name} was removed from SlackClaw.`, "updated"),
                ...currentState.activity
              ].slice(0, 20)
            : currentState.activity
        }
      };
    });

    return {
      status: "completed",
      message: "Team was removed.",
      overview: await this.getOverview()
    };
  }
}
