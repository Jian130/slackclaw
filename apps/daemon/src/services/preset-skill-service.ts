import type {
  PresetSkillDefinition,
  PresetSkillSyncEntry,
  PresetSkillSyncOverview,
  PresetSkillTargetMode
} from "@chillclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { normalizePresetSkillIds, presetSkillDefinitionById } from "../config/ai-member-presets.js";
import { EventPublisher } from "./event-publisher.js";
import { defaultPresetSkillState, type PresetSkillSelectionState, type PresetSkillState, StateStore } from "./state-store.js";

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

function summaryFor(targetMode: PresetSkillTargetMode, entries: PresetSkillSyncEntry[]): string {
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

function repairRecommended(entries: PresetSkillSyncEntry[]): boolean {
  return entries.some((entry) => entry.status !== "verified");
}

function buildSyncOverview(targetMode: PresetSkillTargetMode, entries: PresetSkillSyncEntry[]): PresetSkillSyncOverview {
  return {
    targetMode,
    entries,
    summary: summaryFor(targetMode, entries),
    repairRecommended: repairRecommended(entries)
  };
}

function createEntry(
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

function defaultSyncState(): PresetSkillState {
  return defaultPresetSkillState();
}

function buildPendingSyncOverview(
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

    return createEntry(definition, targetMode, "pending", now);
  });

  return buildSyncOverview(targetMode, entries);
}

export class PresetSkillService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly eventPublisher?: EventPublisher
  ) {}

  async getOverview(): Promise<PresetSkillSyncOverview> {
    const state = await this.store.read();
    const presetState = state.presetSkills ?? defaultSyncState();
    if (presetState.syncOverview) {
      return presetState.syncOverview;
    }

    const targetMode = presetState.targetMode;
    const desiredPresetSkillIds = desiredPresetSkillsFromSelections(presetState.selections);
    const entries = desiredPresetSkillIds
      .map((presetSkillId) => presetSkillDefinitionById(presetSkillId))
      .filter((definition): definition is PresetSkillDefinition => Boolean(definition))
      .map((definition) => createEntry(definition, targetMode, "pending", new Date().toISOString()));

    return buildSyncOverview(targetMode, entries);
  }

  async setDesiredPresetSkillIds(
    scope: PresetSkillScope,
    presetSkillIds: string[],
    options?: SetDesiredPresetSkillIdsOptions
  ): Promise<PresetSkillSyncOverview> {
    const normalized = normalizePresetSkillIds(presetSkillIds);
    const nextState = await this.store.update((current) => {
      const presetSkills = current.presetSkills ?? defaultSyncState();
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

    const targetMode = nextState.presetSkills?.targetMode ?? defaultSyncState().targetMode;
    if (options?.waitForReconcile === false) {
      const pendingOverview = buildPendingSyncOverview(targetMode, normalized);
      await this.commitSyncOverview(nextState.presetSkills ?? defaultSyncState(), pendingOverview);

      if (pendingOverview.entries.some((entry) => entry.status === "pending")) {
        void this.reconcilePresetSkills({ targetMode }).catch(() => undefined);
      }

      return pendingOverview;
    }

    return this.reconcilePresetSkills({
      targetMode
    });
  }

  async reconcilePresetSkills(options?: ReconcilePresetSkillsOptions): Promise<PresetSkillSyncOverview> {
    const state = await this.store.read();
    const presetSkills = state.presetSkills ?? defaultSyncState();
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

        return [definition.id, createEntry(definition, targetMode, "pending", now)];
      })
    );

    await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));

    for (const presetSkillId of desiredPresetSkillIds) {
      const definition = presetSkillDefinitionById(presetSkillId);
      if (!definition) {
        continue;
      }

      const initialEntry = createEntry(definition, targetMode, "pending", new Date().toISOString());
      entryMap.set(definition.id, initialEntry);
      await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));

      const verifiedBeforeInstall = await this.adapter.config.verifyManagedSkill(definition.runtimeSlug);
      if (isUsableRuntimeSkill(verifiedBeforeInstall)) {
        entryMap.set(
          definition.id,
          createEntry(definition, targetMode, "verified", new Date().toISOString(), {
            installedVersion: verifiedBeforeInstall.version
          })
        );
        await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));
        continue;
      }

      entryMap.set(
        definition.id,
        createEntry(definition, targetMode, "installing", new Date().toISOString())
      );
      await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));

      try {
        const installResult = await this.adapter.config.installManagedSkill({
          slug: definition.runtimeSlug,
          installSource: definition.installSource,
          version: definition.pinnedVersion,
          bundledAssetPath: definition.bundledAssetPath
        });

        entryMap.set(
          definition.id,
          createEntry(definition, targetMode, "installed", new Date().toISOString(), {
            installedVersion: installResult.version
          })
        );
        await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));

        const verified = await this.adapter.config.verifyManagedSkill(definition.runtimeSlug);
        if (!isUsableRuntimeSkill(verified)) {
          entryMap.set(
            definition.id,
            createEntry(definition, targetMode, "failed", new Date().toISOString(), {
              installedVersion: installResult.version,
              lastError: `ChillClaw installed ${definition.runtimeSlug}, but verification did not find a usable skill in the active runtime.`
            })
          );
          await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));
          continue;
        }

        entryMap.set(
          definition.id,
          createEntry(definition, targetMode, "verified", new Date().toISOString(), {
            installedVersion: verified.version ?? installResult.version
          })
        );
        await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));
      } catch (error) {
        entryMap.set(
          definition.id,
          createEntry(definition, targetMode, "failed", new Date().toISOString(), {
            lastError: error instanceof Error ? error.message : `ChillClaw could not install ${definition.runtimeSlug}.`
          })
        );
        await this.commitSyncOverview(presetSkills, buildSyncOverview(targetMode, [...entryMap.values()]));
      }
    }

    return this.getOverview();
  }

  async publishCurrentOverview(): Promise<PresetSkillSyncOverview> {
    const overview = await this.getOverview();
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

  private async commitSyncOverview(presetSkills: PresetSkillState, overview: PresetSkillSyncOverview): Promise<void> {
    await this.store.update((current) => ({
      ...current,
      presetSkills: {
        ...(current.presetSkills ?? defaultSyncState()),
        targetMode: overview.targetMode,
        selections: presetSkills.selections,
        syncOverview: overview,
        lastReconciledAt: new Date().toISOString()
      }
    }));

    this.eventPublisher?.publishPresetSkillSyncUpdated(overview);
  }
}
