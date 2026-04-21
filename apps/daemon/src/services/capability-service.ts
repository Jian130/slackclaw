import type {
  CapabilityEntry,
  CapabilityKind,
  CapabilityOverview,
  CapabilityRequirement,
  CapabilityStatus,
  ManagedPluginEntry,
  PluginConfigOverview,
  PresetSkillDefinition,
  PresetSkillSyncEntry,
  PresetSkillSyncOverview,
  PresetSkillTargetMode,
  SupportedChannelId
} from "@chillclaw/contracts";

import { listCapabilityCatalogEntries, type CapabilityCatalogEntry } from "../config/capability-catalog.js";
import { normalizePresetSkillIds, presetSkillDefinitionById } from "../config/ai-member-presets.js";
import {
  managedFeatureDefinitionById,
  managedFeatureDefinitionForChannel,
  type ManagedFeatureDefinition,
  type ManagedFeatureId
} from "../config/managed-features.js";
import type { EngineAdapter, SkillRuntimeEntry } from "../engine/adapter.js";
import { EventPublisher } from "./event-publisher.js";
import { defaultPresetSkillState, type PresetSkillSelectionState, type PresetSkillState, StateStore } from "./state-store.js";
import { ToolService } from "./tool-service.js";

export type PreparedFeaturePrerequisite =
  | {
      type: "openclaw-plugin";
      status: "ready";
      pluginId: string;
      displayName: string;
    }
  | {
      type: "external-installer";
      status: "queued";
      installerId: string;
      displayName: string;
      command: string[];
    };

export interface FeaturePreparationResult {
  feature: ManagedFeatureDefinition;
  prerequisites: PreparedFeaturePrerequisite[];
  pluginConfig?: PluginConfigOverview;
}

type PresetSkillScope = string;

export interface ReconcilePresetSkillsOptions {
  targetMode?: PresetSkillTargetMode;
  presetSkillIds?: string[];
}

export interface SetDesiredPresetSkillIdsOptions {
  targetMode?: PresetSkillTargetMode;
  waitForReconcile?: boolean;
}

function uniquePresetSkillIds(presetSkillIds: string[]): string[] {
  return [...new Set(presetSkillIds.map((presetSkillId) => presetSkillId.trim()).filter(Boolean))];
}

function isUsableRuntimeSkill(
  entry: Awaited<ReturnType<EngineAdapter["config"]["verifyManagedSkill"]>>
): entry is NonNullable<Awaited<ReturnType<EngineAdapter["config"]["verifyManagedSkill"]>>> {
  return Boolean(entry && entry.eligible && !entry.disabled && !entry.blockedByAllowlist);
}

function desiredPresetSkillsFromSelections(selections: Record<string, PresetSkillSelectionState>): string[] {
  return uniquePresetSkillIds(Object.values(selections).flatMap((selection) => selection.presetSkillIds));
}

function presetSkillSyncSummary(targetMode: PresetSkillTargetMode, entries: PresetSkillSyncEntry[]): string {
  if (entries.length === 0) {
    return "No preset skills selected.";
  }

  const failed = entries.filter((entry) => entry.status === "failed").length;
  const verified = entries.filter((entry) => entry.status === "verified").length;
  const inFlight = entries.filter((entry) => entry.status === "pending" || entry.status === "installing" || entry.status === "installed").length;

  if (failed > 0) {
    return `${failed} preset skill${failed === 1 ? "" : "s"} need repair on the ${targetMode} runtime.`;
  }

  if (inFlight > 0) {
    return `${inFlight} preset skill${inFlight === 1 ? "" : "s"} are syncing on the ${targetMode} runtime.`;
  }

  return `${verified} preset skill${verified === 1 ? "" : "s"} verified on the ${targetMode} runtime.`;
}

function presetSkillRepairRecommended(entries: PresetSkillSyncEntry[]): boolean {
  return entries.some((entry) => entry.status !== "verified");
}

function buildPresetSkillSyncOverview(targetMode: PresetSkillTargetMode, entries: PresetSkillSyncEntry[]): PresetSkillSyncOverview {
  return {
    targetMode,
    entries,
    summary: presetSkillSyncSummary(targetMode, entries),
    repairRecommended: presetSkillRepairRecommended(entries)
  };
}

function createPresetSkillSyncEntry(
  definition: PresetSkillDefinition,
  targetMode: PresetSkillTargetMode,
  status: PresetSkillSyncEntry["status"],
  updatedAt: string,
  overrides?: Partial<PresetSkillSyncEntry>
): PresetSkillSyncEntry {
  return {
    presetSkillId: definition.id,
    runtimeSlug: definition.runtimeSlug,
    targetMode,
    status,
    updatedAt,
    ...overrides
  };
}

function buildPendingPresetSkillSyncOverview(
  targetMode: PresetSkillTargetMode,
  presetSkillIds: string[]
): PresetSkillSyncOverview {
  const now = new Date().toISOString();
  const entries = uniquePresetSkillIds(presetSkillIds).map((presetSkillId) => {
    const definition = presetSkillDefinitionById(presetSkillId);

    if (!definition) {
      return {
        presetSkillId,
        runtimeSlug: presetSkillId,
        targetMode,
        status: "failed" as const,
        lastError: "Unknown preset skill.",
        updatedAt: now
      };
    }

    return createPresetSkillSyncEntry(definition, targetMode, "pending", now);
  });

  return buildPresetSkillSyncOverview(targetMode, entries);
}

export class CapabilityService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly toolService = new ToolService(adapter),
    private readonly store?: StateStore,
    private readonly eventPublisher?: EventPublisher
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

  async prepareChannel(channelId: SupportedChannelId): Promise<FeaturePreparationResult | undefined> {
    const feature = managedFeatureDefinitionForChannel(channelId);
    if (!feature) {
      return undefined;
    }

    return this.prepareFeature(feature.id);
  }

  async prepareFeature(featureId: ManagedFeatureId): Promise<FeaturePreparationResult> {
    const feature = managedFeatureDefinitionById(featureId);
    if (!feature) {
      throw new Error(`Unknown managed feature: ${featureId}`);
    }

    let pluginConfig: FeaturePreparationResult["pluginConfig"];
    const prerequisites: PreparedFeaturePrerequisite[] = [];

    for (const prerequisite of feature.prerequisites) {
      if (prerequisite.type === "openclaw-plugin") {
        pluginConfig = await this.adapter.plugins.ensureFeatureRequirements(feature.id, {
          deferGatewayRestart: true
        });
        prerequisites.push({
          type: "openclaw-plugin",
          status: "ready",
          pluginId: prerequisite.pluginId,
          displayName: prerequisite.displayName
        });
        continue;
      }

      prerequisites.push({
        type: "external-installer",
        status: "queued",
        installerId: prerequisite.installerId,
        displayName: prerequisite.displayName,
        command: prerequisite.command
      });
    }

    return {
      feature,
      prerequisites,
      pluginConfig
    };
  }

  async getPresetSkillSyncOverview(): Promise<PresetSkillSyncOverview> {
    const store = this.requirePresetSkillStore();
    const state = await store.read();
    const presetState = state.presetSkills ?? defaultPresetSkillState();
    if (presetState.syncOverview) {
      return presetState.syncOverview;
    }

    const targetMode = presetState.targetMode;
    const desiredPresetSkillIds = desiredPresetSkillsFromSelections(presetState.selections);
    const entries = desiredPresetSkillIds
      .map((presetSkillId) => presetSkillDefinitionById(presetSkillId))
      .filter((definition): definition is PresetSkillDefinition => Boolean(definition))
      .map((definition) => createPresetSkillSyncEntry(definition, targetMode, "pending", new Date().toISOString()));

    return buildPresetSkillSyncOverview(targetMode, entries);
  }

  async setDesiredPresetSkillIds(
    scope: PresetSkillScope,
    presetSkillIds: string[],
    options?: SetDesiredPresetSkillIdsOptions
  ): Promise<PresetSkillSyncOverview> {
    const store = this.requirePresetSkillStore();
    const normalized = normalizePresetSkillIds(presetSkillIds);
    const nextState = await store.update((current) => {
      const presetSkills = current.presetSkills ?? defaultPresetSkillState();
      const targetMode = options?.targetMode ?? presetSkills.targetMode;
      const selections = {
        ...presetSkills.selections,
        [scope]: {
          presetSkillIds: normalized,
          targetMode,
          updatedAt: new Date().toISOString()
        }
      };

      return {
        ...current,
        presetSkills: {
          ...presetSkills,
          targetMode,
          selections
        }
      };
    });

    const targetMode = nextState.presetSkills?.targetMode ?? defaultPresetSkillState().targetMode;
    if (options?.waitForReconcile === false) {
      const pendingOverview = buildPendingPresetSkillSyncOverview(targetMode, normalized);
      await this.commitPresetSkillSyncOverview(nextState.presetSkills ?? defaultPresetSkillState(), pendingOverview);

      if (pendingOverview.entries.some((entry) => entry.status === "pending")) {
        void this.reconcilePresetSkills({ targetMode }).catch(() => undefined);
      }

      return pendingOverview;
    }

    return this.reconcilePresetSkills({ targetMode });
  }

  async reconcilePresetSkills(options?: ReconcilePresetSkillsOptions): Promise<PresetSkillSyncOverview> {
    const store = this.requirePresetSkillStore();
    const state = await store.read();
    const presetSkills = state.presetSkills ?? defaultPresetSkillState();
    const targetMode = options?.targetMode ?? presetSkills.targetMode;
    const desiredPresetSkillIds = uniquePresetSkillIds(
      options?.presetSkillIds ?? desiredPresetSkillsFromSelections(presetSkills.selections)
    );
    const now = new Date().toISOString();
    const entryMap = new Map<string, PresetSkillSyncEntry>(
      desiredPresetSkillIds.map((presetSkillId) => {
        const definition = presetSkillDefinitionById(presetSkillId);

        if (!definition) {
          return [
            presetSkillId,
            {
              presetSkillId,
              runtimeSlug: presetSkillId,
              targetMode,
              status: "failed",
              lastError: "Unknown preset skill.",
              updatedAt: now
            }
          ];
        }

        return [definition.id, createPresetSkillSyncEntry(definition, targetMode, "pending", now)];
      })
    );

    await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));

    for (const presetSkillId of desiredPresetSkillIds) {
      const definition = presetSkillDefinitionById(presetSkillId);
      if (!definition) {
        continue;
      }

      const initialEntry = createPresetSkillSyncEntry(definition, targetMode, "pending", new Date().toISOString());
      entryMap.set(definition.id, initialEntry);
      await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));

      const verifiedBeforeInstall = await this.adapter.config.verifyManagedSkill(definition.runtimeSlug);
      if (isUsableRuntimeSkill(verifiedBeforeInstall)) {
        entryMap.set(
          definition.id,
          createPresetSkillSyncEntry(definition, targetMode, "verified", new Date().toISOString(), {
            installedVersion: verifiedBeforeInstall.version
          })
        );
        await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));
        continue;
      }

      entryMap.set(
        definition.id,
        createPresetSkillSyncEntry(definition, targetMode, "installing", new Date().toISOString())
      );
      await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));

      try {
        const installResult = await this.adapter.config.installManagedSkill({
          slug: definition.runtimeSlug,
          installSource: definition.installSource,
          version: definition.pinnedVersion,
          bundledAssetPath: definition.bundledAssetPath
        });

        entryMap.set(
          definition.id,
          createPresetSkillSyncEntry(definition, targetMode, "installed", new Date().toISOString(), {
            installedVersion: installResult.version
          })
        );
        await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));

        const verified = await this.adapter.config.verifyManagedSkill(definition.runtimeSlug);
        if (!isUsableRuntimeSkill(verified)) {
          entryMap.set(
            definition.id,
            createPresetSkillSyncEntry(definition, targetMode, "failed", new Date().toISOString(), {
              installedVersion: installResult.version,
              lastError: `ChillClaw installed ${definition.runtimeSlug}, but verification did not find a usable skill in the active runtime.`
            })
          );
          await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));
          continue;
        }

        entryMap.set(
          definition.id,
          createPresetSkillSyncEntry(definition, targetMode, "verified", new Date().toISOString(), {
            installedVersion: verified.version ?? installResult.version
          })
        );
        await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));
      } catch (error) {
        entryMap.set(
          definition.id,
          createPresetSkillSyncEntry(definition, targetMode, "failed", new Date().toISOString(), {
            lastError: error instanceof Error ? error.message : `ChillClaw could not install ${definition.runtimeSlug}.`
          })
        );
        await this.commitPresetSkillSyncOverview(presetSkills, buildPresetSkillSyncOverview(targetMode, [...entryMap.values()]));
      }
    }

    return this.getPresetSkillSyncOverview();
  }

  async publishCurrentPresetSkillSyncOverview(): Promise<PresetSkillSyncOverview> {
    const overview = await this.getPresetSkillSyncOverview();
    this.eventPublisher?.publishPresetSkillSyncUpdated(overview);
    return overview;
  }

  async resolveVerifiedRuntimeSkillIds(presetSkillIds: string[]): Promise<string[]> {
    const normalized = normalizePresetSkillIds(presetSkillIds);
    const resolvedRuntimeSkillIds: string[] = [];
    const missingPresetSkills: string[] = [];

    for (const presetSkillId of normalized) {
      const definition = presetSkillDefinitionById(presetSkillId);
      if (!definition) {
        missingPresetSkills.push(presetSkillId);
        continue;
      }

      const verified = await this.adapter.config.verifyManagedSkill(definition.runtimeSlug);
      if (!isUsableRuntimeSkill(verified)) {
        missingPresetSkills.push(presetSkillId);
        continue;
      }

      resolvedRuntimeSkillIds.push(verified.id);
    }

    if (missingPresetSkills.length > 0) {
      throw new Error(
        `Selected preset skills are not verified in the active OpenClaw runtime: ${missingPresetSkills.join(", ")}. Repair the runtime skills and try again.`
      );
    }

    return uniquePresetSkillIds(resolvedRuntimeSkillIds);
  }

  private requirePresetSkillStore(): StateStore {
    if (!this.store) {
      throw new Error("CapabilityService preset skill sync requires a StateStore.");
    }

    return this.store;
  }

  private async commitPresetSkillSyncOverview(presetSkills: PresetSkillState, overview: PresetSkillSyncOverview): Promise<void> {
    const store = this.requirePresetSkillStore();
    await store.update((current) => ({
      ...current,
      presetSkills: {
        ...(current.presetSkills ?? defaultPresetSkillState()),
        targetMode: overview.targetMode,
        selections: presetSkills.selections,
        syncOverview: overview,
        lastReconciledAt: new Date().toISOString()
      }
    }));

    this.eventPublisher?.publishPresetSkillSyncUpdated(overview);
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
