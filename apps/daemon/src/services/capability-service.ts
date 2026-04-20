import type {
  CapabilityEntry,
  CapabilityKind,
  CapabilityOverview,
  CapabilityRequirement,
  CapabilityStatus,
  ManagedPluginEntry
} from "@chillclaw/contracts";

import { listCapabilityCatalogEntries, type CapabilityCatalogEntry } from "../config/capability-catalog.js";
import type { EngineAdapter, SkillRuntimeEntry } from "../engine/adapter.js";
import { ToolService } from "./tool-service.js";

export class CapabilityService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly toolService = new ToolService(adapter)
  ) {}

  async getOverview(): Promise<CapabilityOverview> {
    const [skillCatalog, pluginOverview, toolOverview] = await Promise.all([
      this.adapter.config.getSkillRuntimeCatalog(),
      this.adapter.plugins.getConfigOverview(),
      this.toolService.getOverview()
    ]);
    const catalogEntries = listCapabilityCatalogEntries();
    const entries: CapabilityEntry[] = [];
    const entriesByKey = new Map<string, CapabilityEntry>();

    const registerEntry = (entry: CapabilityEntry, aliases: string[] = []) => {
      entries.push(entry);
      entriesByKey.set(entryKey(entry.kind, entry.id), entry);
      for (const alias of aliases) {
        entriesByKey.set(entryKey(entry.kind, alias), entry);
      }
    };

    for (const skill of skillCatalog.skills) {
      registerEntry(toSkillCapabilityEntry(this.adapter.capabilities.engine, skill), [skill.slug, skill.id].filter(Boolean) as string[]);
    }

    for (const definition of catalogEntries.filter((entry) => entry.kind === "skill")) {
      if (!entriesByKey.has(entryKey("skill", definition.id))) {
        registerEntry(toCatalogCapabilityEntry(this.adapter.capabilities.engine, definition, "missing"));
      }
    }

    for (const plugin of pluginOverview.entries) {
      registerEntry(toPluginCapabilityEntry(this.adapter.capabilities.engine, plugin), [
        plugin.id,
        plugin.configKey,
        plugin.runtimePluginId
      ]);
    }

    for (const definition of catalogEntries.filter((entry) => entry.kind === "plugin")) {
      if (!entriesByKey.has(entryKey("plugin", definition.id))) {
        registerEntry(toCatalogCapabilityEntry(this.adapter.capabilities.engine, definition, "missing"));
      }
    }

    for (const tool of toolOverview.entries) {
      registerEntry({
        id: tool.id,
        kind: tool.kind,
        engine: tool.engine,
        label: tool.label,
        description: tool.description,
        status: tool.status,
        summary: tool.summary,
        requirements: [],
        runtimeRef: tool.runtimeRef
      });
    }

    for (const definition of catalogEntries.filter((entry) => entry.kind === "feature" || entry.kind === "preset")) {
      const requirements = definition.requirements.map((requirement) => resolveRequirement(requirement, entriesByKey));
      registerEntry({
        id: definition.id,
        kind: definition.kind,
        engine: this.adapter.capabilities.engine,
        label: definition.label,
        description: definition.description,
        status: aggregateRequirementStatus(requirements),
        summary: summarizeCompositeCapability(requirements),
        requirements,
        runtimeRef: definition.runtimeRef
      });
    }

    return {
      engine: this.adapter.capabilities.engine,
      checkedAt: new Date().toISOString(),
      entries,
      summary: summarizeCapabilities(entries)
    };
  }
}

function toSkillCapabilityEntry(engine: CapabilityEntry["engine"], skill: SkillRuntimeEntry): CapabilityEntry {
  const id = skill.id || skill.slug || skill.name;
  const status = mapSkillStatus(skill);

  return {
    id,
    kind: "skill",
    engine,
    label: skill.name,
    description: skill.description,
    status,
    summary: summarizeSkillStatus(status),
    requirements: [],
    runtimeRef: {
      engine,
      kind: "skill",
      id
    }
  };
}

function toPluginCapabilityEntry(engine: CapabilityEntry["engine"], plugin: ManagedPluginEntry): CapabilityEntry {
  const id = plugin.runtimePluginId || plugin.id;
  const status = mapPluginStatus(plugin);

  return {
    id,
    kind: "plugin",
    engine,
    label: plugin.label,
    description: plugin.detail,
    status,
    summary: plugin.summary || summarizePluginStatus(status),
    requirements: [],
    runtimeRef: {
      engine,
      kind: "plugin",
      id
    }
  };
}

function toCatalogCapabilityEntry(
  engine: CapabilityEntry["engine"],
  definition: CapabilityCatalogEntry,
  status: CapabilityStatus
): CapabilityEntry {
  return {
    id: definition.id,
    kind: definition.kind,
    engine,
    label: definition.label,
    description: definition.description,
    status,
    summary: summarizeCatalogStatus(definition.kind, status),
    requirements: definition.requirements.map((requirement) => ({
      ...requirement,
      status: "unknown" as const
    })),
    runtimeRef: definition.runtimeRef
  };
}

function resolveRequirement(
  requirement: CapabilityCatalogEntry["requirements"][number],
  entriesByKey: Map<string, CapabilityEntry>
): CapabilityRequirement {
  const entry = entriesByKey.get(entryKey(requirement.kind, requirement.id));

  if (!entry) {
    return {
      id: requirement.id,
      kind: requirement.kind,
      label: requirement.label,
      status: defaultMissingStatus(requirement.kind),
      summary: requirement.summary
    };
  }

  return {
    id: requirement.id,
    kind: requirement.kind,
    label: requirement.label || entry.label,
    status: entry.status,
    summary: entry.summary
  };
}

function mapSkillStatus(skill: SkillRuntimeEntry): CapabilityStatus {
  if (skill.disabled) {
    return "disabled";
  }

  if (skill.blockedByAllowlist) {
    return "blocked";
  }

  if (skill.eligible) {
    return "ready";
  }

  return "missing";
}

function mapPluginStatus(plugin: ManagedPluginEntry): CapabilityStatus {
  if (plugin.hasError || plugin.status === "error") {
    return "error";
  }

  if (plugin.installed && plugin.enabled) {
    return "ready";
  }

  if (plugin.installed && !plugin.enabled) {
    return "disabled";
  }

  return "missing";
}

function aggregateRequirementStatus(requirements: CapabilityRequirement[]): CapabilityStatus {
  if (requirements.length === 0) {
    return "ready";
  }

  for (const status of ["error", "blocked", "disabled", "missing", "unknown"] satisfies CapabilityStatus[]) {
    if (requirements.some((requirement) => requirement.status === status)) {
      return status;
    }
  }

  return "ready";
}

function defaultMissingStatus(kind: CapabilityKind): CapabilityStatus {
  return kind === "tool" || kind === "tool-group" ? "unknown" : "missing";
}

function summarizeCompositeCapability(requirements: CapabilityRequirement[]): string {
  const status = aggregateRequirementStatus(requirements);

  if (status === "ready") {
    return "All requirements are ready.";
  }

  const blocked = requirements.filter((requirement) => requirement.status !== "ready");
  return `${blocked.length} requirement${blocked.length === 1 ? "" : "s"} need attention.`;
}

function summarizeSkillStatus(status: CapabilityStatus): string {
  switch (status) {
    case "ready":
      return "Skill is ready.";
    case "disabled":
      return "Skill is disabled.";
    case "blocked":
      return "Skill is blocked by the current OpenClaw allowlist.";
    case "missing":
      return "Skill requirements are missing.";
    default:
      return "Skill status is unknown.";
  }
}

function summarizePluginStatus(status: CapabilityStatus): string {
  switch (status) {
    case "ready":
      return "Plugin is ready.";
    case "disabled":
      return "Plugin is installed but disabled.";
    case "error":
      return "Plugin reported an error.";
    case "missing":
      return "Plugin is not installed.";
    default:
      return "Plugin status is unknown.";
  }
}

function summarizeCatalogStatus(kind: CapabilityKind, status: CapabilityStatus): string {
  if (status === "missing") {
    return `${kindLabel(kind)} is not available in the current runtime.`;
  }

  return `${kindLabel(kind)} status is ${status}.`;
}

function summarizeCapabilities(entries: CapabilityEntry[]): string {
  const ready = entries.filter((entry) => entry.status === "ready").length;
  const attention = entries.length - ready;

  if (entries.length === 0) {
    return "No capabilities found.";
  }

  return `${ready} ready · ${attention} need attention.`;
}

function kindLabel(kind: CapabilityKind): string {
  switch (kind) {
    case "tool-group":
      return "Tool group";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function entryKey(kind: CapabilityKind, id: string | undefined): string {
  return `${kind}:${id ?? ""}`;
}
