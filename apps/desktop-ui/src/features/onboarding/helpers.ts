import type { SaveAIMemberRequest } from "@slackclaw/contracts";

import { resolveMemberAvatarPreset } from "../../shared/avatar-presets.js";

export type OnboardingDestination = "team" | "dashboard" | "chat";

export interface OnboardingEmployeeDraft {
  name: string;
  jobTitle: string;
  avatarPresetId: string;
  personalityTraits: string[];
  skillIds: string[];
  memoryEnabled: boolean;
  brainEntryId: string;
}

export function onboardingDestinationPath(destination: OnboardingDestination): string {
  switch (destination) {
    case "team":
      return "/team";
    case "chat":
      return "/chat";
    case "dashboard":
    default:
      return "/";
  }
}

export function buildOnboardingMemberRequest(draft: OnboardingEmployeeDraft): SaveAIMemberRequest {
  const personality = draft.personalityTraits.join(", ");
  const avatarPreset = resolveMemberAvatarPreset(draft.avatarPresetId);

  return {
    name: draft.name.trim(),
    jobTitle: draft.jobTitle.trim(),
    avatar: {
      presetId: avatarPreset.id,
      accent: avatarPreset.accent,
      emoji: avatarPreset.emoji,
      theme: avatarPreset.theme
    },
    brainEntryId: draft.brainEntryId,
    personality,
    soul: personality,
    workStyles: [],
    skillIds: draft.skillIds,
    knowledgePackIds: [],
    capabilitySettings: {
      memoryEnabled: draft.memoryEnabled,
      contextWindow: 128000
    }
  };
}
