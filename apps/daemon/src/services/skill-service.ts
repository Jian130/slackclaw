import type {
  InstallSkillRequest,
  InstalledSkillDetail,
  InstalledSkillEntry,
  RemoveSkillRequest,
  SaveCustomSkillRequest,
  SkillCatalogActionResponse,
  SkillCatalogOverview,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
  SkillOption,
  UpdateSkillRequest
} from "@slackclaw/contracts";

import type { EngineAdapter, SkillRuntimeEntry } from "../engine/adapter.js";
import { StateStore } from "./state-store.js";

function mapInstalledSkill(
  skill: SkillRuntimeEntry,
  customEntries: Record<string, import("./state-store.js").StoredCustomSkillState>,
  marketplaceEntries: Map<string, { version?: string }>
): InstalledSkillEntry {
  const custom = skill.slug ? customEntries[skill.slug] : undefined;
  const marketplace = skill.slug ? marketplaceEntries.get(skill.slug) : undefined;

  const source =
    custom
      ? "custom"
      : marketplace
        ? "clawhub"
        : skill.source === "openclaw-bundled"
          ? "bundled"
          : skill.source === "openclaw-extra"
            ? "extra"
            : "workspace";
  const managedBy =
    custom
      ? "slackclaw-custom"
      : marketplace
        ? "clawhub"
        : "openclaw";

  return {
    id: skill.id,
    slug: skill.slug,
    name: custom?.name || skill.name,
    description: custom?.description || skill.description,
    source,
    bundled: skill.bundled,
    eligible: skill.eligible,
    disabled: skill.disabled,
    blockedByAllowlist: skill.blockedByAllowlist,
    readiness: skill.disabled ? "disabled" : skill.blockedByAllowlist ? "blocked" : skill.eligible ? "ready" : "missing",
    missing: skill.missing,
    homepage: custom?.homepage || skill.homepage,
    version: marketplace?.version || skill.version,
    managedBy,
    editable: managedBy === "slackclaw-custom",
    removable: managedBy === "slackclaw-custom" || managedBy === "clawhub",
    updatable: managedBy === "clawhub"
  };
}

function toSkillOptions(skills: InstalledSkillEntry[]): SkillOption[] {
  return skills
    .filter((skill) => skill.eligible && !skill.disabled && !skill.blockedByAllowlist)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((skill) => ({
      id: skill.id,
      label: skill.name,
      description: skill.description
    }));
}

export class SkillService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore
  ) {}

  async getConfigOverview(): Promise<SkillCatalogOverview> {
    const [runtime, state, marketplaceInstalled] = await Promise.all([
      this.adapter.config.getSkillRuntimeCatalog(),
      this.store.read(),
      this.adapter.config.listMarketplaceInstalledSkills()
    ]);

    const customEntries = state.skills?.customEntries ?? {};
    const installed = runtime.skills
      .map((skill) => mapInstalledSkill(skill, customEntries, new Map(marketplaceInstalled.map((entry) => [entry.slug, entry]))))
      .sort((left, right) => left.name.localeCompare(right.name));

    const visibleSlugs = new Set(installed.map((skill) => skill.slug).filter((value): value is string => Boolean(value)));
    const staleCustomEntries = Object.keys(customEntries).filter((slug) => !visibleSlugs.has(slug));
    if (staleCustomEntries.length > 0) {
      await this.store.update((current) => {
        const next = { ...(current.skills?.customEntries ?? {}) };
        for (const slug of staleCustomEntries) {
          delete next[slug];
        }

        return {
          ...current,
          skills: {
            customEntries: next
          }
        };
      });
    }

    return {
      managedSkillsDir: runtime.managedSkillsDir,
      workspaceDir: runtime.workspaceDir,
      marketplaceAvailable: runtime.marketplaceAvailable,
      marketplaceSummary: runtime.marketplaceSummary,
      installedSkills: installed,
      readiness: runtime.readiness,
      marketplacePreview: runtime.marketplaceAvailable ? await this.adapter.config.exploreSkillMarketplace(8) : []
    };
  }

  async getSkillOptions(): Promise<SkillOption[]> {
    const overview = await this.getConfigOverview();
    return toSkillOptions(overview.installedSkills);
  }

  async getInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail> {
    const [overview, detail, state] = await Promise.all([
      this.getConfigOverview(),
      this.adapter.config.getInstalledSkillDetail(skillId),
      this.store.read()
    ]);

    const entry = overview.installedSkills.find((skill) => skill.id === skillId);
    const custom = entry?.slug ? state.skills?.customEntries?.[entry.slug] : undefined;

    return {
      ...detail,
      ...(entry ?? {}),
      name: custom?.name || entry?.name || detail.name,
      description: custom?.description || entry?.description || detail.description,
      homepage: custom?.homepage || entry?.homepage || detail.homepage,
      contentPreview:
        custom?.instructions ??
        detail.contentPreview
    };
  }

  async searchMarketplace(query: string): Promise<SkillMarketplaceEntry[]> {
    const [results, installed] = await Promise.all([
      this.adapter.config.searchSkillMarketplace(query, 10),
      this.adapter.config.listMarketplaceInstalledSkills()
    ]);
    const installedSet = new Set(installed.map((entry) => entry.slug));
    return results.map((entry) => ({
      ...entry,
      installed: installedSet.has(entry.slug)
    }));
  }

  async getMarketplaceDetail(slug: string): Promise<SkillMarketplaceDetail> {
    return this.adapter.config.getSkillMarketplaceDetail(slug);
  }

  async installMarketplaceSkill(request: InstallSkillRequest): Promise<SkillCatalogActionResponse> {
    const result = await this.adapter.config.installMarketplaceSkill(request);
    return {
      status: "completed",
      message: `${request.slug} was installed.`,
      skillConfig: await this.getConfigOverview(),
      requiresGatewayApply: result.requiresGatewayApply
    };
  }

  async saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest): Promise<SkillCatalogActionResponse> {
    const saved = await this.adapter.config.saveCustomSkill(skillId, request);
    await this.store.update((current) => ({
      ...current,
      skills: {
        customEntries: {
          ...(current.skills?.customEntries ?? {}),
          [saved.slug]: {
            slug: saved.slug,
            name: request.name,
            description: request.description,
            instructions: request.instructions,
            homepage: request.homepage?.trim() || undefined,
            updatedAt: new Date().toISOString()
          }
        }
      }
    }));

    return {
      status: "completed",
      message: skillId ? `${request.name} was updated.` : `${request.name} was created.`,
      skillConfig: await this.getConfigOverview(),
      requiresGatewayApply: saved.requiresGatewayApply
    };
  }

  async updateSkill(skillId: string, request: UpdateSkillRequest): Promise<SkillCatalogActionResponse> {
    const overview = await this.getConfigOverview();
    const skill = overview.installedSkills.find((entry) => entry.id === skillId);

    if (!skill) {
      throw new Error("Skill not found.");
    }

    if (request.action === "edit-custom") {
      if (skill.managedBy !== "slackclaw-custom") {
        throw new Error("Only SlackClaw custom skills can be edited here.");
      }

      return this.saveCustomSkill(skillId, {
        name: request.name?.trim() || skill.name,
        slug: skill.slug,
        description: request.description?.trim() || skill.description,
        instructions: request.instructions?.trim() || "",
        homepage: request.homepage?.trim() || skill.homepage
      });
    }

    if (skill.managedBy !== "clawhub" || !skill.slug) {
      throw new Error("This skill cannot be updated from SlackClaw.");
    }

    const result = await this.adapter.config.updateMarketplaceSkill(skill.slug, request);
    return {
      status: "completed",
      message: request.action === "reinstall" ? `${skill.name} was reinstalled.` : `${skill.name} was updated.`,
      skillConfig: await this.getConfigOverview(),
      requiresGatewayApply: result.requiresGatewayApply
    };
  }

  async removeSkill(skillId: string, request: RemoveSkillRequest = {}): Promise<SkillCatalogActionResponse> {
    const overview = await this.getConfigOverview();
    const skill = overview.installedSkills.find((entry) => entry.id === skillId);

    if (!skill) {
      throw new Error("Skill not found.");
    }

    if (!skill.removable || !skill.slug || (skill.managedBy !== "clawhub" && skill.managedBy !== "slackclaw-custom")) {
      throw new Error("This skill cannot be removed from SlackClaw.");
    }

    const result = await this.adapter.config.removeInstalledSkill(skill.slug, { ...request, managedBy: skill.managedBy });

    if (skill.managedBy === "slackclaw-custom") {
      await this.store.update((current) => {
        const next = { ...(current.skills?.customEntries ?? {}) };
        delete next[skill.slug!];

        return {
          ...current,
          skills: {
            customEntries: next
          }
        };
      });
    }

    return {
      status: "completed",
      message: `${skill.name} was removed.`,
      skillConfig: await this.getConfigOverview(),
      requiresGatewayApply: result.requiresGatewayApply
    };
  }
}
