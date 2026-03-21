import type { MemberAvatar } from "@slackclaw/contracts";

import onboardingAnalyst from "./assets/avatars/onboarding-analyst.svg";
import onboardingBuilder from "./assets/avatars/onboarding-builder.svg";
import onboardingGuide from "./assets/avatars/onboarding-guide.svg";
import onboardingStrategist from "./assets/avatars/onboarding-strategist.svg";
import onboardingVisionary from "./assets/avatars/onboarding-visionary.svg";

export interface AvatarPresetDefinition {
  id: string;
  label: string;
  emoji: string;
  accent: string;
  theme: string;
  imageSrc?: string;
}

export const memberAvatarPresets: AvatarPresetDefinition[] = [
  { id: "operator", label: "Operator", emoji: "🦊", accent: "var(--avatar-1)", theme: "sunrise" },
  { id: "analyst", label: "Analyst", emoji: "🧭", accent: "var(--avatar-2)", theme: "forest" },
  { id: "partner", label: "Partner", emoji: "🌟", accent: "var(--avatar-3)", theme: "ocean" },
  { id: "builder", label: "Builder", emoji: "🛠️", accent: "var(--avatar-4)", theme: "ember" },
  {
    id: "onboarding-analyst",
    label: "Onboarding Analyst",
    emoji: "🧠",
    accent: "#97b5ea",
    theme: "onboarding",
    imageSrc: onboardingAnalyst
  },
  {
    id: "onboarding-strategist",
    label: "Onboarding Strategist",
    emoji: "🗺️",
    accent: "#a9bde8",
    theme: "onboarding",
    imageSrc: onboardingStrategist
  },
  {
    id: "onboarding-builder",
    label: "Onboarding Builder",
    emoji: "🛠️",
    accent: "#9ec1ef",
    theme: "onboarding",
    imageSrc: onboardingBuilder
  },
  {
    id: "onboarding-guide",
    label: "Onboarding Guide",
    emoji: "✨",
    accent: "#a0c7ef",
    theme: "onboarding",
    imageSrc: onboardingGuide
  },
  {
    id: "onboarding-visionary",
    label: "Onboarding Visionary",
    emoji: "🚀",
    accent: "#afc6f0",
    theme: "onboarding",
    imageSrc: onboardingVisionary
  }
];

export function resolveMemberAvatarPreset(presetId?: string): AvatarPresetDefinition {
  return memberAvatarPresets.find((preset) => preset.id === presetId) ?? memberAvatarPresets[0];
}

export function memberAvatarImageSrc(avatar?: Pick<MemberAvatar, "presetId">): string | undefined {
  return resolveMemberAvatarPreset(avatar?.presetId).imageSrc;
}

export function memberAvatarEmoji(avatar?: Pick<MemberAvatar, "presetId" | "emoji">): string {
  return avatar?.emoji || resolveMemberAvatarPreset(avatar?.presetId).emoji;
}

