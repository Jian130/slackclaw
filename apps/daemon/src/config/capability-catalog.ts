import type { CapabilityKind, EngineKind } from "@chillclaw/contracts";

import { aiMemberPresets, presetSkillDefinitionById, presetSkillDefinitions } from "./ai-member-presets.js";
import { listManagedFeatureDefinitions } from "./managed-features.js";
import { listManagedPluginDefinitions, managedPluginDefinitionById } from "./managed-plugins.js";

export interface CapabilityCatalogRequirement {
  id: string;
  kind: CapabilityKind;
  label: string;
  summary: string;
}

export interface CapabilityCatalogRuntimeRef {
  engine: EngineKind;
  kind: CapabilityKind;
  id: string;
}

export interface CapabilityCatalogEntry {
  id: string;
  kind: CapabilityKind;
  label: string;
  description?: string;
  requirements: CapabilityCatalogRequirement[];
  runtimeRef?: CapabilityCatalogRuntimeRef;
}

export interface OpenClawToolDefinition {
  id: string;
  kind: "tool" | "tool-group";
  label: string;
  description: string;
}

export const openClawToolDefinitions: OpenClawToolDefinition[] = [
  {
    id: "group:web",
    kind: "tool-group",
    label: "Web",
    description: "Browser and web search tools exposed through OpenClaw."
  },
  {
    id: "group:fs",
    kind: "tool-group",
    label: "File System",
    description: "File read and write tools exposed through OpenClaw."
  },
  {
    id: "group:runtime",
    kind: "tool-group",
    label: "Runtime",
    description: "Shell and runtime execution tools exposed through OpenClaw."
  },
  {
    id: "group:ui",
    kind: "tool-group",
    label: "UI",
    description: "Desktop and UI automation tools exposed through OpenClaw."
  },
  {
    id: "group:automation",
    kind: "tool-group",
    label: "Automation",
    description: "Scheduled and background automation tools exposed through OpenClaw."
  },
  {
    id: "group:messaging",
    kind: "tool-group",
    label: "Messaging",
    description: "Messaging and channel tools exposed through OpenClaw."
  },
  {
    id: "group:media",
    kind: "tool-group",
    label: "Media",
    description: "Image, audio, video, and document media tools exposed through OpenClaw."
  },
  {
    id: "group:openclaw",
    kind: "tool-group",
    label: "OpenClaw",
    description: "OpenClaw-native tools for engine operations."
  }
];

export function listCapabilityCatalogEntries(): CapabilityCatalogEntry[] {
  return [
    ...listPresetSkillCapabilities(),
    ...listManagedPluginCapabilities(),
    ...listManagedFeatureCapabilities(),
    ...listPresetCapabilities()
  ];
}

function listPresetSkillCapabilities(): CapabilityCatalogEntry[] {
  return presetSkillDefinitions.map((definition) => ({
    id: definition.runtimeSlug,
    kind: "skill" as const,
    label: definition.label,
    description: definition.description,
    requirements: [],
    runtimeRef: {
      engine: "openclaw" as const,
      kind: "skill" as const,
      id: definition.runtimeSlug
    }
  }));
}

function listManagedPluginCapabilities(): CapabilityCatalogEntry[] {
  return listManagedPluginDefinitions().map((definition) => ({
    id: definition.runtimePluginId,
    kind: "plugin" as const,
    label: definition.label,
    description: `OpenClaw plugin package ${definition.packageSpec}.`,
    requirements: [],
    runtimeRef: {
      engine: "openclaw" as const,
      kind: "plugin" as const,
      id: definition.runtimePluginId
    }
  }));
}

function listManagedFeatureCapabilities(): CapabilityCatalogEntry[] {
  return listManagedFeatureDefinitions().map((definition) => ({
    id: definition.id,
    kind: "feature" as const,
    label: definition.label,
    description: `${definition.label} setup and runtime access.`,
    requirements: definition.prerequisites.map((prerequisite) => {
      if (prerequisite.type === "openclaw-plugin") {
        const plugin = managedPluginDefinitionById(prerequisite.pluginId);
        return {
          id: plugin?.runtimePluginId ?? prerequisite.pluginId,
          kind: "plugin" as const,
          label: prerequisite.displayName,
          summary: `${prerequisite.displayName} is required.`
        };
      }

      return {
        id: prerequisite.installerId,
        kind: "tool" as const,
        label: prerequisite.displayName,
        summary: `${prerequisite.displayName} is required.`
      };
    })
  }));
}

function listPresetCapabilities(): CapabilityCatalogEntry[] {
  return aiMemberPresets.map((preset) => ({
    id: preset.id,
    kind: "preset" as const,
    label: preset.label,
    description: preset.description,
    requirements: (preset.presetSkillIds ?? preset.skillIds).map((presetSkillId) => {
      const skill = presetSkillDefinitionById(presetSkillId);
      return {
        id: skill?.runtimeSlug ?? presetSkillId,
        kind: "skill" as const,
        label: skill?.label ?? presetSkillId,
        summary: `${skill?.label ?? presetSkillId} is required.`
      };
    })
  }));
}
