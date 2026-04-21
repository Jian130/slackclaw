import { randomUUID } from "node:crypto";

import type {
  AITeamActionResponse,
  AITeamActivityItem,
  AIMemberDetail,
  AITeamOverview,
  AIMemberPreset,
  BindAIMemberChannelRequest,
  BrainAssignment,
  DeleteAIMemberRequest,
  KnowledgePack,
  MemberBindingsResponse,
  SaveAIMemberRequest,
  SaveTeamRequest,
  SkillOption,
  TeamDetail
} from "@chillclaw/contracts";
import type { EngineAdapter } from "../engine/adapter.js";
import type {
  AIMemberRuntimeCandidate,
  SaveAIMemberRuntimeOptions,
  SkillRuntimeCatalog
} from "../engine/adapter.js";
import { aiMemberPresets, defaultAIMemberSkillOptions, normalizePresetSkillIds } from "../config/ai-member-presets.js";
import type { CapabilityService } from "./capability-service.js";
import { EventPublisher } from "./event-publisher.js";
import { fallbackMutationSyncMeta } from "./mutation-sync.js";
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

function isChillClawManagedMemberAgentId(agentId: string | undefined): boolean {
  return Boolean(agentId?.trim().startsWith("chillclaw-member-"));
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
      ? `Detected from OpenClaw with ${candidate.modelKey}. Add ChillClaw details to manage it here.`
      : "Detected from OpenClaw. Add ChillClaw details to manage it here.",
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

function preferredPrimaryMemberAgentId(members: AITeamOverview["members"]): string | undefined {
  return members
    .filter((member) => member.source !== "detected" && member.agentId.trim())
    .sort((left, right) => {
      const leftHasBindings = left.bindingCount > 0 || left.bindings.length > 0 ? 0 : 1;
      const rightHasBindings = right.bindingCount > 0 || right.bindings.length > 0 ? 0 : 1;
      if (leftHasBindings !== rightHasBindings) {
        return leftHasBindings - rightHasBindings;
      }

      const nameDelta = left.name.localeCompare(right.name);
      if (nameDelta !== 0) {
        return nameDelta;
      }

      return left.agentId.localeCompare(right.agentId);
    })[0]?.agentId;
}

function rehomeStoredBinding(
  members: AITeamState["members"],
  targetMemberId: string,
  binding: string,
  nextBindings: MemberBindingsResponse["bindings"],
  updatedAt: string
): AITeamState["members"] {
  const nextMembers = { ...members };

  for (const [memberId, member] of Object.entries(members)) {
    if (memberId === targetMemberId) {
      nextMembers[memberId] = {
        ...member,
        bindingCount: nextBindings.length,
        bindings: nextBindings,
        lastUpdatedAt: updatedAt
      };
      continue;
    }

    const filteredBindings = member.bindings.filter((entry) => entry.target !== binding);
    if (filteredBindings.length === member.bindings.length) {
      continue;
    }

    nextMembers[memberId] = {
      ...member,
      bindingCount: filteredBindings.length,
      bindings: filteredBindings,
      lastUpdatedAt: updatedAt
    };
  }

  return nextMembers;
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

function resolveMemberPresets(
  knowledgePacks: KnowledgePack[],
  skillOptions: SkillOption[]
): AIMemberPreset[] {
  const availableKnowledgePackIds = new Set(knowledgePacks.map((pack) => pack.id));
  const availableSkillIds = new Set(skillOptions.map((skill) => skill.id));

  return aiMemberPresets.map((preset) => ({
    ...preset,
    presetSkillIds: normalizePresetSkillIds(preset.presetSkillIds),
    skillIds: preset.skillIds.filter((skillId) => availableSkillIds.has(skillId)),
    knowledgePackIds: preset.knowledgePackIds.filter((packId) => availableKnowledgePackIds.has(packId))
  }));
}

function mergeSkillOptions(runtimeSkillOptions: SkillOption[]): SkillOption[] {
  const byId = new Map<string, SkillOption>();

  for (const skill of defaultAIMemberSkillOptions) {
    byId.set(skill.id, skill);
  }

  for (const skill of runtimeSkillOptions) {
    byId.set(skill.id, skill);
  }

  return Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function buildRuntimeSkillOptions(runtimeSkills: SkillRuntimeCatalog): SkillOption[] {
  return runtimeSkills.skills
    .filter((skill) => skill.eligible && !skill.disabled && !skill.blockedByAllowlist)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (skill): SkillOption => ({
        id: skill.id,
        label: skill.name,
        description: skill.description
      })
    );
}

interface PersistMemberOptions {
  deferPresetSkillResolution?: boolean;
  runtimeSave?: SaveAIMemberRuntimeOptions;
  currentStatus?: string;
  activityDescription?: string;
}

export class AITeamService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly eventPublisher?: EventPublisher,
    private readonly capabilityService?: Pick<CapabilityService, "getPresetSkillSyncOverview" | "resolveVerifiedRuntimeSkillIds">
  ) {}

  async getOverview(): Promise<AITeamOverview> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const modelConfig = await this.adapter.config.getModelConfig();
    const runtimeSkills = await this.adapter.config.getSkillRuntimeCatalog();
    const teams = Object.values(aiTeam.teams).sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0) || left.name.localeCompare(right.name));
    const runtimeSkillOptions = buildRuntimeSkillOptions(runtimeSkills);
    const baseOverview = {
      teamVision: aiTeam.teamVision,
      members: [],
      teams,
      activity: aiTeam.activity,
      availableBrains: modelConfig.savedEntries,
      memberPresets: [],
      knowledgePacks: DEFAULT_KNOWLEDGE_PACKS,
      skillOptions: mergeSkillOptions(runtimeSkillOptions)
    } satisfies AITeamOverview;
    const memberPresets = resolveMemberPresets(baseOverview.knowledgePacks, baseOverview.skillOptions);
    const runtimeMembers = await this.adapter.aiEmployees.listAIMemberRuntimeCandidates();
    const storedByAgentId = new Map(Object.values(aiTeam.members).map((member) => [member.agentId, member]));
    const availableBrainIds = new Set(modelConfig.savedEntries.map((entry) => entry.id));

    const members = runtimeMembers
      .filter((candidate) => !isChillClawManagedMemberAgentId(candidate.agentId) || storedByAgentId.has(candidate.agentId))
      .map((candidate) => {
        const stored = storedByAgentId.get(candidate.agentId);
        const inferred = importedMemberSummary(candidate, baseOverview, teams);

        return {
          ...(stored ?? inferred),
          source: stored ? (stored.source ?? "chillclaw") : inferred.source,
          hasManagedMetadata: stored ? (stored.hasManagedMetadata ?? true) : inferred.hasManagedMetadata,
          name: stored?.name?.trim() || inferred.name,
          jobTitle: stored?.jobTitle?.trim() || inferred.jobTitle,
          currentStatus: stored?.currentStatus?.trim() || inferred.currentStatus,
          teamIds: withTeamIds((stored ?? inferred).id, teams),
          bindingCount: candidate.bindingCount || stored?.bindingCount || stored?.bindings.length || 0,
          bindings: stored?.bindings ?? inferred.bindings,
          brain: stored?.brain?.entryId && availableBrainIds.has(stored.brain.entryId) ? stored.brain : inferred.brain,
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
      memberPresets,
      knowledgePacks: DEFAULT_KNOWLEDGE_PACKS,
      skillOptions: baseOverview.skillOptions,
      presetSkillSync: this.capabilityService ? await this.capabilityService.getPresetSkillSyncOverview() : undefined
    };
  }

  async saveMember(memberId: string | undefined, request: SaveAIMemberRequest): Promise<AITeamActionResponse> {
    const { current, requiresGatewayApply } = await this.persistMember(memberId, request);
    const nextOverview = await this.getOverview();
    const sync = this.eventPublisher?.publishAITeamUpdated(nextOverview) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message: current ? `${request.name.trim()} was updated.` : `${request.name.trim()} was created.`,
      overview: nextOverview,
      requiresGatewayApply
    };
  }

  async saveMemberForOnboarding(
    memberId: string | undefined,
    request: SaveAIMemberRequest,
    options?: { deferWarmup?: boolean }
  ): Promise<{ member: AIMemberDetail; requiresGatewayApply?: boolean }> {
    const { member, requiresGatewayApply } = await this.persistMember(memberId, request, {
      deferPresetSkillResolution: options?.deferWarmup,
      currentStatus: options?.deferWarmup ? "Finishing workspace setup in the background." : "Ready for new assignments.",
      activityDescription: options?.deferWarmup
        ? `${request.name.trim()} is ready to open and will finish workspace setup in the background.`
        : `${request.name.trim()} is ready and mapped to an OpenClaw agent.`,
      runtimeSave: options?.deferWarmup
        ? {
            performMemoryIndex: false,
            ensurePrimaryAgent: false
          }
        : undefined
    });
    return {
      member,
      requiresGatewayApply
    };
  }

  private async persistMember(
    memberId: string | undefined,
    request: SaveAIMemberRequest,
    options?: PersistMemberOptions
  ): Promise<{ current: AIMemberDetail | undefined; member: AIMemberDetail; requiresGatewayApply?: boolean }> {
    if (!request.name.trim()) {
      throw new Error("AI member name is required.");
    }

    if (!request.jobTitle.trim()) {
      throw new Error("Job title is required.");
    }

    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const id = memberId ?? randomUUID();
    const current = aiTeam.members[id];
    const modelConfig = await this.adapter.config.getModelConfig();
    const runtimeSkills = await this.adapter.config.getSkillRuntimeCatalog();
    const normalizedPresetSkillIds = normalizePresetSkillIds(request.presetSkillIds);
    const brain = buildBrainAssignment(modelConfig.savedEntries, request.brainEntryId);
    const knowledgePacks = DEFAULT_KNOWLEDGE_PACKS.filter((pack) => request.knowledgePackIds.includes(pack.id));
    const requestedSkillIds =
      options?.deferPresetSkillResolution && normalizedPresetSkillIds.length > 0
        ? [...new Set(request.skillIds)]
        : normalizedPresetSkillIds.length
          ? await this.resolvePresetSkillRequest(normalizedPresetSkillIds)
          : [...new Set(request.skillIds)];
    const selectedSkills = mergeSkillOptions(buildRuntimeSkillOptions(runtimeSkills)).filter((skill) => requestedSkillIds.includes(skill.id));
    const selectedSkillIds = options?.deferPresetSkillResolution ? requestedSkillIds : selectedSkills.map((skill) => skill.id);
    const missingSkillIds = options?.deferPresetSkillResolution
      ? []
      : requestedSkillIds.filter((skillId) => !selectedSkillIds.includes(skillId));
    if (!options?.deferPresetSkillResolution && missingSkillIds.length > 0) {
      throw new Error(
        `Selected skills are not verified in the active OpenClaw runtime: ${missingSkillIds.join(", ")}. Repair the runtime skills and try again.`
      );
    }
    const runtime = await this.adapter.aiEmployees.saveAIMemberRuntime(
      {
        memberId: id,
        existingAgentId: current?.agentId,
        name: request.name.trim(),
        jobTitle: request.jobTitle.trim(),
        avatar: request.avatar,
        personality: request.personality.trim(),
        soul: request.soul.trim(),
        workStyles: request.workStyles,
        skillIds: selectedSkillIds,
        selectedSkills,
        capabilitySettings: request.capabilitySettings,
        knowledgePacks,
        brain
      },
      options?.runtimeSave
    );
    const nextMember: AIMemberDetail = {
      id,
      agentId: runtime.agentId,
      source: "chillclaw" as const,
      hasManagedMetadata: true,
      name: request.name.trim(),
      jobTitle: request.jobTitle.trim(),
      status: "ready" as const,
      currentStatus: options?.currentStatus?.trim() || "Ready for new assignments.",
      activeTaskCount: current?.activeTaskCount ?? 0,
      avatar: request.avatar,
      brain,
      teamIds: withTeamIds(id, Object.values(aiTeam.teams)),
      bindingCount: runtime.bindings.length,
      bindings: runtime.bindings,
      lastUpdatedAt: new Date().toISOString(),
      personality: request.personality.trim(),
      soul: request.soul.trim(),
      workStyles: request.workStyles,
      presetSkillIds: normalizedPresetSkillIds.length > 0 ? normalizedPresetSkillIds : undefined,
      skillIds: selectedSkillIds,
      knowledgePackIds: request.knowledgePackIds,
      capabilitySettings: request.capabilitySettings,
      agentDir: runtime.agentDir,
      workspaceDir: runtime.workspaceDir
    };

    await this.store.update((state) => {
      const currentState = state.aiTeam ?? defaultAITeamState();
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
              options?.activityDescription?.trim() ||
                (current
                  ? `${nextMember.name} was updated and synced to OpenClaw.`
                  : `${nextMember.name} is ready and mapped to an OpenClaw agent.`),
              current ? "updated" : "assigned"
            ),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    return {
      current,
      member: nextMember,
      requiresGatewayApply: runtime.requiresGatewayApply
    };
  }

  async markOnboardingWarmupProgress(memberId: string, currentStatus: string, activityDescription?: string): Promise<void> {
    await this.updateStoredMember(memberId, {
      currentStatus,
      activityAction: "Continuing setup",
      activityDescription,
      activityTone: "started"
    });
  }

  async finalizeOnboardingWarmup(memberId: string): Promise<AIMemberDetail> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const member = aiTeam.members[memberId];

    if (!member) {
      throw new Error("The AI employee is missing from ChillClaw.");
    }

    if (!member.brain) {
      throw new Error("The AI employee is missing its saved model assignment.");
    }

    const runtimeSkills = await this.adapter.config.getSkillRuntimeCatalog();
    const requestedSkillIds = member.presetSkillIds?.length
      ? await this.resolvePresetSkillRequest(member.presetSkillIds)
      : [...new Set(member.skillIds)];
    const selectedSkills = mergeSkillOptions(buildRuntimeSkillOptions(runtimeSkills)).filter((skill) => requestedSkillIds.includes(skill.id));
    const selectedSkillIds = selectedSkills.map((skill) => skill.id);
    const missingSkillIds = requestedSkillIds.filter((skillId) => !selectedSkillIds.includes(skillId));
    if (missingSkillIds.length > 0) {
      throw new Error(
        `Selected skills are not verified in the active OpenClaw runtime: ${missingSkillIds.join(", ")}. Repair the runtime skills and try again.`
      );
    }

    const runtime = await this.adapter.aiEmployees.saveAIMemberRuntime(
      {
        memberId: member.id,
        existingAgentId: member.agentId,
        name: member.name,
        jobTitle: member.jobTitle,
        avatar: member.avatar,
        personality: member.personality,
        soul: member.soul,
        workStyles: member.workStyles,
        skillIds: selectedSkillIds,
        selectedSkills,
        capabilitySettings: member.capabilitySettings,
        knowledgePacks: DEFAULT_KNOWLEDGE_PACKS.filter((pack) => member.knowledgePackIds.includes(pack.id)),
        brain: member.brain
      },
      {
        markGatewayApplyPending: false,
        ensurePrimaryAgent: false
      }
    );

    const updatedMember: AIMemberDetail = {
      ...member,
      agentId: runtime.agentId,
      bindingCount: runtime.bindings.length,
      bindings: runtime.bindings,
      skillIds: selectedSkillIds,
      currentStatus: "Ready for new assignments.",
      lastUpdatedAt: new Date().toISOString(),
      agentDir: runtime.agentDir,
      workspaceDir: runtime.workspaceDir
    };

    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: {
            ...currentState.members,
            [memberId]: updatedMember
          },
          activity: [
            activityItem(
              memberId,
              updatedMember.name,
              "Workspace ready",
              `${updatedMember.name} finished workspace setup and is ready for new assignments.`,
              "completed"
            ),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    await this.publishAITeamSnapshot();
    return updatedMember;
  }

  async markOnboardingWarmupFailed(memberId: string, message: string): Promise<void> {
    await this.updateStoredMember(memberId, {
      currentStatus: `Finish setup needs repair: ${message}`,
      activityAction: "Finish setup needs repair",
      activityDescription: message,
      activityTone: "updated"
    });
  }

  async deleteMember(memberId: string, request: DeleteAIMemberRequest): Promise<AITeamActionResponse> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const member = aiTeam.members[memberId];

    if (!member) {
      throw new Error("AI member not found.");
    }

    const currentPrimaryAgentId = await this.adapter.aiEmployees.getPrimaryAIMemberAgentId();
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
                ? `${member.name} was removed from ChillClaw and OpenClaw, and the workspace/history was kept in place.`
                : `${member.name} was removed from ChillClaw, OpenClaw, and the workspace/history.`,
              "updated"
            ),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    let promotionRequiresGatewayApply = false;
    let nextOverview = await this.getOverview();
    if (currentPrimaryAgentId === member.agentId || result.wasPrimary) {
      const nextPrimaryAgentId = preferredPrimaryMemberAgentId(nextOverview.members);
      const promotion = await this.adapter.aiEmployees.setPrimaryAIMemberAgent(nextPrimaryAgentId);
      promotionRequiresGatewayApply = promotion.requiresGatewayApply === true;
      nextOverview = await this.getOverview();
    }
    const sync = this.eventPublisher?.publishAITeamUpdated(nextOverview) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message:
        request.deleteMode === "keep-workspace"
          ? `${member.name} was removed and the workspace/history was kept.`
          : `${member.name} was removed.`,
      overview: nextOverview,
      requiresGatewayApply: result.requiresGatewayApply || promotionRequiresGatewayApply
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
    const updatedAt = new Date().toISOString();
    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: rehomeStoredBinding(currentState.members, memberId, request.binding, bindings, updatedAt),
          activity: [
            activityItem(memberId, member.name, "Bound channel", `${member.name} is now bound to ${request.binding}.`, "updated"),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    const nextOverview = await this.getOverview();
    const sync = this.eventPublisher?.publishAITeamUpdated(nextOverview) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message: `${member.name} is now bound to ${request.binding}.`,
      overview: nextOverview,
      requiresGatewayApply: result.requiresGatewayApply
    };
  }

  async bindMemberChannelForOnboarding(
    memberId: string,
    request: BindAIMemberChannelRequest
  ): Promise<{ requiresGatewayApply?: boolean }> {
    const state = await this.store.read();
    const aiTeam = state.aiTeam ?? defaultAITeamState();
    const member = aiTeam.members[memberId];

    if (!member) {
      throw new Error("AI member not found.");
    }

    const result = await this.adapter.aiEmployees.bindAIMemberChannel(member.agentId, request);
    const bindings = result.bindings;
    const updatedAt = new Date().toISOString();
    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: rehomeStoredBinding(currentState.members, memberId, request.binding, bindings, updatedAt),
          activity: [
            activityItem(memberId, member.name, "Bound channel", `${member.name} is now bound to ${request.binding}.`, "updated"),
            ...currentState.activity
          ].slice(0, 20)
        }
      };
    });

    return {
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

    const nextOverview = await this.getOverview();
    const sync = this.eventPublisher?.publishAITeamUpdated(nextOverview) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message: `${member.name} is no longer bound to ${request.binding}.`,
      overview: nextOverview,
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

    const nextOverview = await this.getOverview();
    const sync = this.eventPublisher?.publishAITeamUpdated(nextOverview) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message: `${request.name.trim()} was saved.`,
      overview: nextOverview
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
                activityItem(undefined, undefined, "Deleted AI team", `${deleted.name} was removed from ChillClaw.`, "updated"),
                ...currentState.activity
              ].slice(0, 20)
            : currentState.activity
        }
      };
    });

    const nextOverview = await this.getOverview();
    const sync = this.eventPublisher?.publishAITeamUpdated(nextOverview) ?? fallbackMutationSyncMeta();

    return {
      ...sync,
      status: "completed",
      message: "Team was removed.",
      overview: nextOverview
    };
  }

  private async resolvePresetSkillRequest(presetSkillIds: string[]): Promise<string[]> {
    if (this.capabilityService) {
      return this.capabilityService.resolveVerifiedRuntimeSkillIds(presetSkillIds);
    }

    throw new Error("Preset skills cannot be resolved because capability preset sync is unavailable.");
  }

  private async updateStoredMember(
    memberId: string,
    options: {
      currentStatus: string;
      activityAction?: string;
      activityDescription?: string;
      activityTone?: AITeamActivityItem["tone"];
    }
  ): Promise<void> {
    let memberName: string | undefined;

    await this.store.update((current) => {
      const currentState = current.aiTeam ?? defaultAITeamState();
      const member = currentState.members[memberId];

      if (!member) {
        return current;
      }

      memberName = member.name;
      const nextMember = {
        ...member,
        currentStatus: options.currentStatus,
        lastUpdatedAt: new Date().toISOString()
      };

      return {
        ...current,
        aiTeam: {
          ...currentState,
          members: {
            ...currentState.members,
            [memberId]: nextMember
          },
          activity: options.activityDescription
            ? [
                activityItem(
                  memberId,
                  member.name,
                  options.activityAction ?? "Updated AI member",
                  options.activityDescription,
                  options.activityTone ?? "updated"
                ),
                ...currentState.activity
              ].slice(0, 20)
            : currentState.activity
        }
      };
    });

    if (!memberName) {
      return;
    }

    await this.publishAITeamSnapshot();
  }

  private async publishAITeamSnapshot(): Promise<void> {
    if (!this.eventPublisher) {
      return;
    }

    this.eventPublisher.publishAITeamUpdated(await this.getOverview());
  }
}
