import type {
  AIMemberPreset,
  OnboardingEmployeePresetPresentation,
  OnboardingEmployeePresetTheme,
  PresetSkillDefinition,
  SkillOption
} from "@slackclaw/contracts";

interface ManagedAIMemberPresetDefinition extends AIMemberPreset {
  memberBuilderVisible?: boolean;
  onboardingPresentation?: {
    theme: OnboardingEmployeePresetTheme;
    avatarPresetId: string;
    starterSkillLabels: string[];
    toolLabels: string[];
  };
}

export const presetSkillDefinitions: PresetSkillDefinition[] = [
  {
    id: "research-brief",
    label: "Research Brief",
    description: "Create concise research summaries with findings, risks, and next steps.",
    onboardingSafe: true,
    runtimeSlug: "research-brief",
    installSource: "bundled",
    bundledAssetPath: "apps/daemon/preset-skills/research-brief/SKILL.md"
  },
  {
    id: "status-writer",
    label: "Status Writer",
    description: "Turn progress into crisp status updates with blockers and recommended follow-ups.",
    onboardingSafe: true,
    runtimeSlug: "status-writer",
    installSource: "bundled",
    bundledAssetPath: "apps/daemon/preset-skills/status-writer/SKILL.md"
  }
];

const aiMemberPresetCatalog: ManagedAIMemberPresetDefinition[] = [
  {
    id: "general-assistant",
    label: "General Assistant",
    description: "Start with a dependable default setup for everyday requests, summaries, and follow-ups.",
    avatarPresetId: "operator",
    jobTitle: "General Assistant",
    personality: "Clear, practical, and dependable",
    soul: "Turn requests into useful next steps without adding extra complexity.",
    workStyles: ["Methodical", "Structured"],
    presetSkillIds: presetSkillDefinitions.map((definition) => definition.id),
    skillIds: ["research-brief", "status-writer"],
    knowledgePackIds: ["company-handbook", "delivery-playbook"],
    defaultMemoryEnabled: true
  },
  {
    id: "research-analyst",
    label: "Research Analyst",
    description: "Research quickly, write crisp summaries, and keep answers grounded in the right context.",
    avatarPresetId: "analyst",
    jobTitle: "Research Analyst",
    personality: "Analytical, calm, and evidence-driven",
    soul: "Separate signal from noise and turn findings into crisp recommendations.",
    workStyles: ["Analytical", "Concise"],
    presetSkillIds: ["research-brief", "status-writer"],
    skillIds: ["research-brief", "status-writer"],
    knowledgePackIds: ["company-handbook", "delivery-playbook"],
    defaultMemoryEnabled: true,
    onboardingPresentation: {
      theme: "analyst",
      avatarPresetId: "onboarding-analyst",
      starterSkillLabels: ["Research Brief", "Status Writer"],
      toolLabels: ["Company handbook", "Delivery playbook"]
    }
  },
  {
    id: "ops-coordinator",
    label: "Ops Coordinator",
    description: "Favor fast status updates, structured execution, and recovery-oriented communication.",
    avatarPresetId: "builder",
    jobTitle: "Operations Coordinator",
    personality: "Organized, proactive, and steady under pressure",
    soul: "Keep work moving, surface blockers early, and make the next step obvious.",
    workStyles: ["Structured", "Fast-paced"],
    presetSkillIds: ["status-writer", "research-brief"],
    skillIds: ["status-writer", "research-brief"],
    knowledgePackIds: ["delivery-playbook", "customer-voice"],
    defaultMemoryEnabled: true
  },
  {
    id: "support-captain",
    label: "Support Captain",
    description: "Handle customer-facing requests with calm tone, clear follow-ups, and fast status updates.",
    avatarPresetId: "partner",
    jobTitle: "Support Captain",
    personality: "Calm, supportive, and decisive",
    soul: "Keep customer-facing communication steady, clear, and easy to act on.",
    workStyles: ["Calm", "Supportive"],
    presetSkillIds: ["status-writer"],
    skillIds: ["status-writer"],
    knowledgePackIds: ["customer-voice"],
    defaultMemoryEnabled: true,
    memberBuilderVisible: false,
    onboardingPresentation: {
      theme: "support",
      avatarPresetId: "onboarding-guide",
      starterSkillLabels: ["Status Writer"],
      toolLabels: ["Customer voice", "Memory"]
    }
  },
  {
    id: "delivery-operator",
    label: "Delivery Operator",
    description: "Turn briefs into checklists, track milestones, and keep execution moving without extra setup.",
    avatarPresetId: "builder",
    jobTitle: "Delivery Operator",
    personality: "Methodical, action-oriented, and steady",
    soul: "Turn plans into practical execution and keep momentum visible.",
    workStyles: ["Methodical", "Action-oriented"],
    presetSkillIds: ["research-brief"],
    skillIds: ["research-brief"],
    knowledgePackIds: ["delivery-playbook", "company-handbook"],
    defaultMemoryEnabled: true,
    memberBuilderVisible: false,
    onboardingPresentation: {
      theme: "operator",
      avatarPresetId: "onboarding-builder",
      starterSkillLabels: ["Research Brief"],
      toolLabels: ["Delivery playbook", "Company handbook"]
    }
  }
];

function toAIMemberPreset(definition: ManagedAIMemberPresetDefinition): AIMemberPreset {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    avatarPresetId: definition.avatarPresetId,
    jobTitle: definition.jobTitle,
    personality: definition.personality,
    soul: definition.soul,
    workStyles: [...definition.workStyles],
    presetSkillIds: definition.presetSkillIds ? [...definition.presetSkillIds] : undefined,
    skillIds: [...definition.skillIds],
    knowledgePackIds: [...definition.knowledgePackIds],
    defaultMemoryEnabled: definition.defaultMemoryEnabled
  };
}

export const defaultAIMemberSkillOptions: SkillOption[] = presetSkillDefinitions.map((definition) => ({
  id: definition.id,
  label: definition.label,
  description: definition.description
}));

export const aiMemberPresets: AIMemberPreset[] = aiMemberPresetCatalog
  .filter((definition) => definition.memberBuilderVisible !== false)
  .map((definition) => toAIMemberPreset(definition));

export function aiMemberPresetById(presetId: string): AIMemberPreset | undefined {
  const definition = aiMemberPresetCatalog.find((entry) => entry.id === presetId);
  return definition ? toAIMemberPreset(definition) : undefined;
}

export function presetSkillDefinitionById(presetSkillId: string): PresetSkillDefinition | undefined {
  return presetSkillDefinitions.find((definition) => definition.id === presetSkillId);
}

export function presetSkillDefinitionByRuntimeSlug(runtimeSlug: string): PresetSkillDefinition | undefined {
  return presetSkillDefinitions.find((definition) => definition.runtimeSlug === runtimeSlug);
}

export function normalizePresetSkillIds(presetSkillIds: string[] | undefined): string[] {
  return [...new Set((presetSkillIds ?? []).map((presetSkillId) => presetSkillId.trim()).filter(Boolean))];
}

export function onboardingEmployeePresetPresentationById(
  presetId: string
): OnboardingEmployeePresetPresentation | undefined {
  const definition = aiMemberPresetCatalog.find((entry) => entry.id === presetId);
  if (!definition?.onboardingPresentation) {
    return undefined;
  }

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    theme: definition.onboardingPresentation.theme,
    avatarPresetId: definition.onboardingPresentation.avatarPresetId,
    starterSkillLabels: [...definition.onboardingPresentation.starterSkillLabels],
    toolLabels: [...definition.onboardingPresentation.toolLabels],
    presetSkillIds: definition.presetSkillIds ? [...definition.presetSkillIds] : undefined,
    knowledgePackIds: [...definition.knowledgePackIds],
    workStyles: [...definition.workStyles],
    defaultMemoryEnabled: definition.defaultMemoryEnabled
  };
}
