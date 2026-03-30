import { constants } from "node:fs";
import { access as accessPath, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type {
  InstallSkillRequest,
  InstalledSkillDetail,
  PluginConfigOverview,
  RemoveSkillRequest,
  SaveCustomSkillRequest,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
  UpdateSkillRequest
} from "@slackclaw/contracts";

import {
  listManagedPluginDefinitions,
  managedPluginConfigKeys,
  managedPluginDefinitionById,
  managedPluginDefinitionForFeature
} from "../config/managed-plugins.js";
import type { CommandResult } from "../platform/cli-runner.js";
import type {
  ManagedSkillInstallRequest,
  ManagedSkillInstallResult,
  SkillRuntimeCatalog,
  SkillRuntimeEntry
} from "./adapter.js";

interface OpenClawSkillMissing {
  bins?: string[];
  anyBins?: string[];
  env?: string[];
  config?: string[];
  os?: string[];
}

interface OpenClawSkillsListJson {
  workspaceDir?: string;
  managedSkillsDir?: string;
  skills?: Array<{
    name?: string;
    description?: string;
    emoji?: string;
    eligible?: boolean;
    disabled?: boolean;
    blockedByAllowlist?: boolean;
    source?: string;
    bundled?: boolean;
    homepage?: string;
    missing?: OpenClawSkillMissing;
  }>;
}

interface OpenClawSkillInfoJson {
  name?: string;
  description?: string;
  source?: string;
  bundled?: boolean;
  filePath?: string;
  baseDir?: string;
  skillKey?: string;
  homepage?: string;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  eligible?: boolean;
  missing?: OpenClawSkillMissing;
}

type WorkspaceSkillMetadata = {
  slug?: string;
  description?: string;
  homepage?: string;
  version?: string;
  filePath?: string;
  baseDir?: string;
};

type PluginInspection = {
  entries: Array<{ enabled?: boolean; status?: string }>;
  diagnostics: Array<{ message?: string }>;
  loadError?: string;
  duplicate?: boolean;
};

type CapabilityConfigAccess = {
  readSkillSnapshot: () => Promise<{ list?: OpenClawSkillsListJson; warnings: string[] }>;
  runClawHub: (args: string[], options?: { allowFailure?: boolean }) => Promise<CommandResult>;
  runOpenClaw: (args: string[], options?: { allowFailure?: boolean }) => Promise<CommandResult>;
  markGatewayApplyPending: () => Promise<void>;
  invalidateReadCaches: (resources: Array<"plugins" | "channels" | "skills">) => void;
  readBundledManagedSkillMarkdown: (slug: string, assetPath?: string) => Promise<string | undefined>;
  readOpenClawSkillsList: () => Promise<OpenClawSkillsListJson | undefined>;
  getConfiguredChannelEntries: () => Promise<Array<{ channelId: string }>>;
  readOpenClawConfigSnapshot: () => Promise<{
    configPath: string;
    config: {
      channels?: Record<string, unknown>;
      plugins?: {
        entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
      };
      [key: string]: unknown;
    };
  }>;
  writeOpenClawConfigSnapshot: (
    configPath: string,
    config: {
      channels?: Record<string, unknown>;
      plugins?: {
        entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
      };
      [key: string]: unknown;
    }
  ) => Promise<void>;
  inspectPlugin: (pluginId: string) => Promise<PluginInspection>;
  restartGatewayAndRequireHealthy: (reason: string) => Promise<unknown>;
};

function safeJsonPayloadParse<T>(value: string | undefined): T | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function normalizeSkillMissing(missing?: OpenClawSkillMissing): SkillRuntimeEntry["missing"] {
  return {
    bins: missing?.bins ?? [],
    anyBins: missing?.anyBins ?? [],
    env: missing?.env ?? [],
    config: missing?.config ?? [],
    os: missing?.os ?? []
  };
}

function parseSkillFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");

  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const result: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === "---") {
      break;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    result[key] = rawValue.replace(/^"(.*)"$/, "$1");
  }

  return result;
}

function stripSkillFrontmatter(content: string): string {
  if (!content.startsWith("---")) {
    return content.trim();
  }

  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return content.trim();
  }

  return content.slice(end + 4).trim();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await accessPath(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function slugifySkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCustomSkillMarkdown(
  request: SaveCustomSkillRequest,
  slug: string,
  version = "0.1.0"
): string {
  const lines = [
    "---",
    `name: "${request.name.replace(/"/g, '\\"')}"`,
    `slug: ${slug}`,
    `version: "${version}"`,
    ...(request.homepage?.trim() ? [`homepage: ${request.homepage.trim()}`] : []),
    `description: "${request.description.replace(/"/g, '\\"')}"`,
    "---",
    "",
    "## When to Use",
    "",
    request.description.trim() || "Use this skill when the user needs the workflow described here.",
    "",
    "## Instructions",
    "",
    request.instructions.trim() || "Add the skill-specific instructions here."
  ];

  return `${lines.join("\n").trim()}\n`;
}

function isUsableManagedSkillEntry(entry: SkillRuntimeEntry | undefined): entry is SkillRuntimeEntry {
  return Boolean(entry && entry.eligible && !entry.disabled && !entry.blockedByAllowlist);
}

function parseClawHubSearchOutput(output: string): SkillMarketplaceEntry[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("- Searching"))
    .flatMap((line): SkillMarketplaceEntry[] => {
      const parts = line.split(/\s{2,}/).filter(Boolean);
      if (parts.length < 2) {
        return [];
      }

      return [{
        slug: parts[0],
        name: parts[1],
        summary: "",
        latestVersion: undefined,
        updatedLabel: undefined,
        ownerHandle: undefined,
        downloads: undefined,
        stars: undefined,
        installed: false,
        curated: false
      }];
    });
}

function parseClawHubExploreOutput(output: string): SkillMarketplaceEntry[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("- Fetching latest skills"))
    .flatMap((line): SkillMarketplaceEntry[] => {
      const parts = line.split(/\s{2,}/).filter(Boolean);
      if (parts.length < 4) {
        return [];
      }

      return [{
        slug: parts[0],
        name: parts[0],
        summary: parts.slice(3).join(" "),
        latestVersion: parts[1].replace(/^v/i, ""),
        updatedLabel: parts[2],
        ownerHandle: undefined,
        downloads: undefined,
        stars: undefined,
        installed: false,
        curated: true
      }];
    });
}

function toSkillReadinessSummary(skills: SkillRuntimeEntry[], warnings: string[]) {
  const disabled = skills.filter((skill) => skill.disabled).length;
  const blocked = skills.filter((skill) => skill.blockedByAllowlist).length;
  const missing = skills.filter((skill) => !skill.eligible && !skill.disabled && !skill.blockedByAllowlist).length;
  const eligible = skills.filter((skill) => skill.eligible && !skill.disabled && !skill.blockedByAllowlist).length;

  return {
    total: skills.length,
    eligible,
    disabled,
    blocked,
    missing,
    warnings,
    summary: `${eligible} ready · ${missing} missing requirements${warnings.length > 0 ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`
  };
}

export class CapabilityConfigCoordinator {
  constructor(private readonly access: CapabilityConfigAccess) {}

  async getSkillRuntimeCatalog(): Promise<SkillRuntimeCatalog> {
    const snapshot = await this.access.readSkillSnapshot();
    const list = snapshot.list;
    const skillsDir = await this.resolveSharedSkillsDir(list);
    const workspaceMetadata = await this.readWorkspaceSkillMetadata(skillsDir);
    const marketplaceAvailable = Boolean(await this.resolveClawHubContext());
    const skills = (list?.skills ?? []).flatMap((skill): SkillRuntimeEntry[] => {
      const skillName = skill.name?.trim();

      if (!skillName) {
        return [];
      }

      const metadata = workspaceMetadata.get(skillName);
      return [{
        id: skillName,
        slug: metadata?.slug,
        name: skillName,
        description: skill.description?.trim() || metadata?.description || "",
        source: skill.source?.trim() || "openclaw-workspace",
        bundled: Boolean(skill.bundled),
        eligible: Boolean(skill.eligible),
        disabled: Boolean(skill.disabled),
        blockedByAllowlist: Boolean(skill.blockedByAllowlist),
        missing: normalizeSkillMissing(skill.missing),
        homepage: skill.homepage?.trim() || metadata?.homepage,
        version: metadata?.version,
        filePath: metadata?.filePath,
        baseDir: metadata?.baseDir
      }];
    });

    return {
      workspaceDir: list?.workspaceDir?.trim() || undefined,
      managedSkillsDir: skillsDir ?? (list?.managedSkillsDir?.trim() || undefined),
      readiness: toSkillReadinessSummary(skills, snapshot.warnings),
      marketplaceAvailable,
      marketplaceSummary: marketplaceAvailable
        ? "ClawHub search and install are available."
        : "ClawHub CLI is not installed on this Mac.",
      skills
    };
  }

  async getInstalledSkillDetail(skillId: string): Promise<InstalledSkillDetail> {
    const result = await this.access.runOpenClaw(["skills", "info", skillId, "--json"], { allowFailure: true });
    const parsed =
      safeJsonPayloadParse<OpenClawSkillInfoJson>(result.stdout) ??
      safeJsonPayloadParse<OpenClawSkillInfoJson>(result.stderr);

    if (!parsed) {
      throw new Error(`SlackClaw could not read details for ${skillId}.`);
    }

    const content = parsed.filePath ? await readFile(parsed.filePath, "utf8").catch(() => "") : "";
    const frontmatter = parseSkillFrontmatter(content);

    return {
      id: parsed.skillKey?.trim() || skillId,
      slug: frontmatter.slug?.trim() || (parsed.baseDir ? basename(parsed.baseDir) : undefined),
      name: parsed.name?.trim() || skillId,
      description: parsed.description?.trim() || frontmatter.description?.trim() || "",
      source: parsed.source === "openclaw-bundled" ? "bundled" : parsed.source === "openclaw-extra" ? "extra" : "workspace",
      bundled: Boolean(parsed.bundled),
      eligible: Boolean(parsed.eligible),
      disabled: Boolean(parsed.disabled),
      blockedByAllowlist: Boolean(parsed.blockedByAllowlist),
      readiness: parsed.disabled ? "disabled" : parsed.blockedByAllowlist ? "blocked" : parsed.eligible ? "ready" : "missing",
      missing: normalizeSkillMissing(parsed.missing),
      homepage: parsed.homepage?.trim() || frontmatter.homepage?.trim() || undefined,
      version: frontmatter.version?.trim() || undefined,
      managedBy: "openclaw",
      editable: false,
      removable: false,
      updatable: false,
      filePath: parsed.filePath?.trim() || undefined,
      baseDir: parsed.baseDir?.trim() || undefined,
      contentPreview: content ? stripSkillFrontmatter(content).slice(0, 6000) : undefined
    };
  }

  async listMarketplaceInstalledSkills(): Promise<Array<{ slug: string; version?: string }>> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      return [];
    }

    const result = await this.access.runClawHub(["--workdir", context.workdir, "--dir", context.dir, "list"], { allowFailure: true });
    if (result.code !== 0) {
      return [];
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s{2,}/).filter(Boolean))
      .map((parts) => ({
        slug: parts[0],
        version: parts[1]
      }))
      .filter((entry) => Boolean(entry.slug));
  }

  async getSkillMarketplaceDetail(slug: string): Promise<SkillMarketplaceDetail> {
    const context = await this.resolveClawHubContext();
    const argsPrefix = context ? ["--workdir", context.workdir, "--dir", context.dir] : [];
    const [metadataResult, fileResult, installed] = await Promise.all([
      this.access.runClawHub([...argsPrefix, "inspect", slug, "--json"], { allowFailure: true }),
      this.access.runClawHub([...argsPrefix, "inspect", slug, "--file", "SKILL.md"], { allowFailure: true }),
      this.listMarketplaceInstalledSkills()
    ]);

    const parsed = safeJsonPayloadParse<{
      skill?: {
        slug?: string;
        displayName?: string;
        summary?: string;
        tags?: { latest?: string };
        stats?: {
          downloads?: number;
          installsCurrent?: number;
          installsAllTime?: number;
          stars?: number;
          versions?: number;
        };
      };
      latestVersion?: {
        version?: string;
        changelog?: string;
        license?: string;
      };
      owner?: {
        handle?: string;
        displayName?: string;
        image?: string;
      };
    }>(metadataResult.stdout) ?? safeJsonPayloadParse(metadataResult.stderr);

    if (!parsed?.skill?.slug) {
      throw new Error(`SlackClaw could not inspect ${slug} from ClawHub.`);
    }

    const installsCurrent = parsed.skill.stats?.installsCurrent;
    const downloads = parsed.skill.stats?.downloads;
    const stars = parsed.skill.stats?.stars;

    return {
      slug: parsed.skill.slug,
      name: parsed.skill.displayName?.trim() || parsed.skill.slug,
      summary: parsed.skill.summary?.trim() || "",
      latestVersion: parsed.latestVersion?.version?.trim() || parsed.skill.tags?.latest?.trim() || undefined,
      updatedLabel: undefined,
      ownerHandle: parsed.owner?.handle?.trim() || undefined,
      downloads,
      stars,
      installed: installed.some((entry) => entry.slug === parsed.skill?.slug),
      curated: Boolean((downloads ?? 0) >= 500 || (stars ?? 0) >= 5 || (installsCurrent ?? 0) >= 10),
      ownerDisplayName: parsed.owner?.displayName?.trim() || undefined,
      ownerImageUrl: parsed.owner?.image?.trim() || undefined,
      changelog: parsed.latestVersion?.changelog?.trim() || undefined,
      license: parsed.latestVersion?.license?.trim() || undefined,
      installsCurrent,
      installsAllTime: parsed.skill.stats?.installsAllTime,
      versions: parsed.skill.stats?.versions,
      filePreview: fileResult.code === 0 ? fileResult.stdout : undefined,
      homepage: undefined
    };
  }

  async exploreSkillMarketplace(limit = 8): Promise<SkillMarketplaceEntry[]> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      return [];
    }

    const result = await this.access.runClawHub(["--workdir", context.workdir, "--dir", context.dir, "explore"], { allowFailure: true });
    if (result.code !== 0) {
      return [];
    }

    const parsed = parseClawHubExploreOutput(result.stdout).slice(0, limit);
    const installedSet = new Set((await this.listMarketplaceInstalledSkills()).map((entry) => entry.slug));
    const details = await Promise.all(parsed.map(async (entry) => this.getSkillMarketplaceDetail(entry.slug).catch(() => undefined)));

    return parsed.map((entry, index) => {
      const detail = details[index];
      return {
        ...entry,
        name: detail?.name ?? entry.name,
        summary: detail?.summary || entry.summary,
        latestVersion: detail?.latestVersion ?? entry.latestVersion,
        ownerHandle: detail?.ownerHandle,
        downloads: detail?.downloads,
        stars: detail?.stars,
        installed: installedSet.has(entry.slug),
        curated: detail?.curated ?? entry.curated
      };
    });
  }

  async searchSkillMarketplace(query: string, limit = 10): Promise<SkillMarketplaceEntry[]> {
    const trimmed = query.trim();
    const context = await this.resolveClawHubContext();

    if (!trimmed || !context) {
      return [];
    }

    const result = await this.access.runClawHub(
      ["--workdir", context.workdir, "--dir", context.dir, "search", trimmed, "--limit", String(limit)],
      { allowFailure: true }
    );
    if (result.code !== 0) {
      return [];
    }

    const parsed = parseClawHubSearchOutput(result.stdout).slice(0, limit);
    const installedSet = new Set((await this.listMarketplaceInstalledSkills()).map((entry) => entry.slug));
    const details = await Promise.all(parsed.map(async (entry) => this.getSkillMarketplaceDetail(entry.slug).catch(() => undefined)));

    return parsed.map((entry, index) => {
      const detail = details[index];
      return {
        ...entry,
        name: detail?.name ?? entry.name,
        summary: detail?.summary ?? entry.summary,
        latestVersion: detail?.latestVersion,
        ownerHandle: detail?.ownerHandle,
        downloads: detail?.downloads,
        stars: detail?.stars,
        installed: installedSet.has(entry.slug),
        curated: detail?.curated ?? false
      };
    });
  }

  async installMarketplaceSkill(request: InstallSkillRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
    }

    const result = await this.access.runClawHub(
      ["--workdir", context.workdir, "--dir", context.dir, "--no-input", "install", request.slug, ...(request.version ? ["--version", request.version] : [])],
      { allowFailure: true }
    );

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not install ${request.slug} from ClawHub.`);
    }

    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["skills"]);
    return { requiresGatewayApply: true };
  }

  async installManagedSkill(request: ManagedSkillInstallRequest): Promise<ManagedSkillInstallResult> {
    const verified = await this.verifyManagedSkill(request.slug);
    if (verified) {
      return {
        runtimeSkillId: verified.id,
        version: verified.version,
        requiresGatewayApply: false
      };
    }

    if (request.installSource === "bundled") {
      const bundledMarkdown = await this.access.readBundledManagedSkillMarkdown(request.slug, request.bundledAssetPath);
      if (!bundledMarkdown) {
        throw new Error(`SlackClaw could not resolve bundled assets for ${request.slug}.`);
      }

      const list = await this.readOpenClawSkillsList();
      const skillsDir = await this.resolveSharedSkillsDir(list);

      if (!skillsDir) {
        throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
      }

      const baseDir = join(skillsDir, request.slug);
      await mkdir(baseDir, { recursive: true });
      await writeFile(join(baseDir, "SKILL.md"), bundledMarkdown);

      await this.access.markGatewayApplyPending();
      this.access.invalidateReadCaches(["skills"]);
      const installed = await this.verifyManagedSkill(request.slug);

      return {
        runtimeSkillId: installed?.id,
        version: installed?.version ?? request.version,
        requiresGatewayApply: true
      };
    }

    if (request.installSource === "clawhub") {
      const result = await this.installMarketplaceSkill({
        slug: request.slug,
        version: request.version
      });
      const installed = await this.verifyManagedSkill(request.slug);

      return {
        runtimeSkillId: installed?.id,
        version: installed?.version,
        requiresGatewayApply: result.requiresGatewayApply
      };
    }

    return {
      runtimeSkillId: undefined,
      version: request.version,
      requiresGatewayApply: false
    };
  }

  async updateMarketplaceSkill(slug: string, request: UpdateSkillRequest): Promise<{ requiresGatewayApply?: boolean }> {
    const context = await this.resolveClawHubContext();

    if (!context) {
      throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
    }

    const args =
      request.action === "reinstall"
        ? ["--workdir", context.workdir, "--dir", context.dir, "--no-input", "install", slug, "--force", ...(request.version ? ["--version", request.version] : [])]
        : ["--workdir", context.workdir, "--dir", context.dir, "update", slug, ...(request.version ? ["--version", request.version] : [])];

    const result = await this.access.runClawHub(args, { allowFailure: true });
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `SlackClaw could not ${request.action} ${slug}.`);
    }

    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["skills"]);
    return { requiresGatewayApply: true };
  }

  async saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest): Promise<{ slug: string; requiresGatewayApply?: boolean }> {
    const list = await this.readOpenClawSkillsList();
    const skillsDir = await this.resolveSharedSkillsDir(list);

    if (!skillsDir) {
      throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
    }

    const existing = skillId ? await this.getInstalledSkillDetail(skillId).catch(() => undefined) : undefined;
    const slug = slugifySkillName(request.slug?.trim() || existing?.slug || request.name);

    if (!slug) {
      throw new Error("Enter a skill name first.");
    }

    const baseDir = join(skillsDir, slug);
    await mkdir(baseDir, { recursive: true });
    await writeFile(join(baseDir, "SKILL.md"), buildCustomSkillMarkdown(request, slug, existing?.version));

    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["skills"]);

    return { slug, requiresGatewayApply: true };
  }

  async removeInstalledSkill(
    slug: string,
    request: RemoveSkillRequest & { managedBy: "clawhub" | "slackclaw-custom" }
  ): Promise<{ requiresGatewayApply?: boolean }> {
    if (request.managedBy === "clawhub") {
      const context = await this.resolveClawHubContext();

      if (!context) {
        throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
      }

      const result = await this.access.runClawHub(["--workdir", context.workdir, "--dir", context.dir, "uninstall", slug, "--yes"], { allowFailure: true });
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `SlackClaw could not remove ${slug}.`);
      }
    } else {
      const list = await this.readOpenClawSkillsList();
      const skillsDir = await this.resolveSharedSkillsDir(list);

      if (!skillsDir) {
        throw new Error("SlackClaw could not resolve the shared OpenClaw skills directory.");
      }

      await rm(join(skillsDir, slug), { recursive: true, force: true });
    }

    await this.access.markGatewayApplyPending();
    this.access.invalidateReadCaches(["skills"]);
    return { requiresGatewayApply: true };
  }

  async verifyManagedSkill(slug: string): Promise<SkillRuntimeEntry | undefined> {
    const catalog = await this.getSkillRuntimeCatalog();
    return catalog.skills.find((entry) => entry.slug === slug && isUsableManagedSkillEntry(entry));
  }

  async getConfigOverview(): Promise<PluginConfigOverview> {
    const channelEntries = await this.access.getConfiguredChannelEntries();
    const configSnapshot = await this.access.readOpenClawConfigSnapshot();

    return {
      entries: await Promise.all(
        listManagedPluginDefinitions().map(async (definition) => {
          const inspected = await this.access.inspectPlugin(definition.runtimePluginId);
          const channelConfiguredInFile = managedPluginConfigKeys(definition).some((key) =>
            Boolean(configSnapshot.config.channels?.[key])
          );
          const dependencyStates = definition.dependencies.map((dependency) => ({
            ...dependency,
            active:
              dependency.id === "channel:wechat-work"
                ? channelConfiguredInFile || channelEntries.some((entry) => entry.channelId === "wechat-work")
                : false
          }));
          const activeDependentCount = dependencyStates.filter((dependency) => dependency.active).length;
          const enabled = inspected.entries.some((entry) => entry.enabled !== false);
          const installed = inspected.entries.length > 0;
          const hasError = Boolean(inspected.loadError || inspected.duplicate);
          const hasUpdate =
            inspected.entries.some((entry) => (entry.status ?? "").toLowerCase().includes("update")) ||
            inspected.diagnostics.some((diagnostic) => /update available/i.test(diagnostic.message ?? ""));

          return {
            id: definition.id,
            label: definition.label,
            packageSpec: definition.packageSpec,
            runtimePluginId: definition.runtimePluginId,
            configKey: definition.configKey,
            status:
              hasError
                ? "error"
                : !installed
                  ? "missing"
                  : hasUpdate
                    ? "update-available"
                    : enabled
                      ? "ready"
                      : "blocked",
            summary: hasError
              ? `${definition.label} has a plugin load problem.`
              : !installed
                ? `${definition.label} is not installed.`
                : hasUpdate
                  ? `${definition.label} has an update available.`
                  : enabled
                    ? `${definition.label} is ready.`
                    : `${definition.label} is installed but disabled.`,
            detail: hasError
              ? inspected.loadError ?? "OpenClaw reported duplicate or invalid plugin state."
              : activeDependentCount > 0
                ? `${definition.dependencies[0]?.label ?? "A managed feature"} currently depends on this plugin.`
                : "Plugin is managed by ChillClaw and ready for feature use.",
            enabled,
            installed,
            hasUpdate,
            hasError,
            activeDependentCount,
            dependencies: dependencyStates
          };
        })
      )
    };
  }

  async ensureFeatureRequirements(
    featureId: string,
    options?: { deferGatewayRestart?: boolean }
  ): Promise<PluginConfigOverview> {
    const definition = managedPluginDefinitionForFeature(featureId as "channel:wechat-work");
    if (!definition) {
      return this.getConfigOverview();
    }

    const inspected = await this.access.inspectPlugin(definition.runtimePluginId);
    if (inspected.loadError) {
      throw new Error(
        `${definition.label} failed to load: ${inspected.loadError}. Repair the installed plugin first, then retry the feature setup.`
      );
    }

    let changed = false;
    if (inspected.entries.length === 0) {
      const install = await this.access.runOpenClaw(["plugins", "install", definition.packageSpec], { allowFailure: true });
      if (install.code !== 0) {
        throw new Error(install.stderr || install.stdout || `ChillClaw could not install ${definition.packageSpec}.`);
      }
      changed = true;
    } else {
      const update = await this.access.runOpenClaw(["plugins", "update", definition.runtimePluginId, "--yes"], { allowFailure: true });
      if (update.code === 0) {
        const output = `${update.stdout}\n${update.stderr}`.toLowerCase();
        if (!/already up[- ]to[- ]date|no updates|already current/.test(output)) {
          changed = true;
        }
      }
    }

    const enable = await this.access.runOpenClaw(["plugins", "enable", definition.runtimePluginId], { allowFailure: true });
    if (enable.code === 0) {
      const output = `${enable.stdout}\n${enable.stderr}`.toLowerCase();
      if (!/already enabled/.test(output)) {
        changed = true;
      }
    } else {
      throw new Error(enable.stderr || enable.stdout || `ChillClaw could not enable ${definition.label}.`);
    }

    if (changed) {
      if (options?.deferGatewayRestart) {
        await this.access.markGatewayApplyPending();
      } else {
        await this.access.restartGatewayAndRequireHealthy(`${definition.label} preparation`);
      }
    }

    this.access.invalidateReadCaches(["plugins", "channels"]);
    return this.getConfigOverview();
  }

  async installPlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const install = await this.access.runOpenClaw(["plugins", "install", definition.packageSpec], { allowFailure: true });
    if (install.code !== 0) {
      throw new Error(install.stderr || install.stdout || `ChillClaw could not install ${definition.packageSpec}.`);
    }

    const enable = await this.access.runOpenClaw(["plugins", "enable", definition.runtimePluginId], { allowFailure: true });
    if (enable.code !== 0) {
      throw new Error(enable.stderr || enable.stdout || `ChillClaw could not enable ${definition.label}.`);
    }

    await this.access.restartGatewayAndRequireHealthy(`${definition.label} installation`);

    this.access.invalidateReadCaches(["plugins", "channels"]);
    return {
      message: `ChillClaw installed ${definition.label} and verified the gateway restart.`,
      pluginConfig: await this.getConfigOverview()
    };
  }

  async updatePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const update = await this.access.runOpenClaw(["plugins", "update", definition.runtimePluginId, "--yes"], { allowFailure: true });
    if (update.code !== 0) {
      throw new Error(update.stderr || update.stdout || `ChillClaw could not update ${definition.label}.`);
    }

    const enable = await this.access.runOpenClaw(["plugins", "enable", definition.runtimePluginId], { allowFailure: true });
    if (enable.code !== 0) {
      throw new Error(enable.stderr || enable.stdout || `ChillClaw could not re-enable ${definition.label}.`);
    }

    await this.access.restartGatewayAndRequireHealthy(`${definition.label} update`);

    this.access.invalidateReadCaches(["plugins", "channels"]);
    return {
      message: `ChillClaw updated ${definition.label} and verified the gateway restart.`,
      pluginConfig: await this.getConfigOverview()
    };
  }

  async removePlugin(pluginId: string): Promise<{ message: string; pluginConfig: PluginConfigOverview }> {
    const definition = managedPluginDefinitionById(pluginId);
    if (!definition) {
      throw new Error("Unknown managed plugin.");
    }

    const overview = await this.getConfigOverview();
    const entry = overview.entries.find((item) => item.id === pluginId);
    if ((entry?.activeDependentCount ?? 0) > 0) {
      throw new Error(`${definition.label} is still required by an active managed feature.`);
    }

    const uninstall = await this.access.runOpenClaw(["plugins", "uninstall", definition.runtimePluginId], { allowFailure: true });
    if (uninstall.code !== 0) {
      throw new Error(uninstall.stderr || uninstall.stdout || `ChillClaw could not remove ${definition.label}.`);
    }

    await this.removeManagedPluginConfigEntry(definition.runtimePluginId);
    for (const channelKey of managedPluginConfigKeys(definition)) {
      await this.removeChannelConfig(channelKey);
    }
    await this.access.restartGatewayAndRequireHealthy(`${definition.label} removal`);

    this.access.invalidateReadCaches(["plugins", "channels"]);
    return {
      message: `ChillClaw removed ${definition.label} and cleaned its managed config.`,
      pluginConfig: await this.getConfigOverview()
    };
  }

  private async readOpenClawSkillsList(): Promise<OpenClawSkillsListJson | undefined> {
    return this.access.readOpenClawSkillsList();
  }

  private async resolveSharedSkillsDir(list?: OpenClawSkillsListJson): Promise<string | undefined> {
    const workspaceDir = list?.workspaceDir?.trim();
    const workspaceSkillsDir = workspaceDir ? join(workspaceDir, "skills") : undefined;
    const managedSkillsDir = list?.managedSkillsDir?.trim();

    if (workspaceSkillsDir && (await fileExists(workspaceSkillsDir))) {
      return workspaceSkillsDir;
    }

    if (managedSkillsDir && (await fileExists(managedSkillsDir))) {
      return managedSkillsDir;
    }

    return workspaceSkillsDir ?? managedSkillsDir;
  }

  private async readWorkspaceSkillMetadata(skillsDir?: string): Promise<Map<string, WorkspaceSkillMetadata>> {
    const metadata = new Map<string, WorkspaceSkillMetadata>();

    if (!skillsDir || !(await fileExists(skillsDir))) {
      return metadata;
    }

    const directoryEntries = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);

    for (const entry of directoryEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const baseDir = join(skillsDir, entry.name);
      const filePath = join(baseDir, "SKILL.md");
      if (!(await fileExists(filePath))) {
        continue;
      }

      const content = await readFile(filePath, "utf8").catch(() => "");
      const frontmatter = parseSkillFrontmatter(content);
      const slug = frontmatter.slug?.trim() || entry.name;
      const name = frontmatter.name?.trim() || entry.name;
      const item = {
        slug,
        version: frontmatter.version?.trim() || undefined,
        filePath,
        baseDir,
        description: frontmatter.description?.trim() || undefined,
        homepage: frontmatter.homepage?.trim() || undefined
      };

      metadata.set(name, item);
      metadata.set(slug, item);
      metadata.set(entry.name, item);
    }

    return metadata;
  }

  private async resolveClawHubContext(): Promise<{ workdir: string; dir: string } | undefined> {
    const skills = await this.readOpenClawSkillsList();
    const skillsDir = await this.resolveSharedSkillsDir(skills);

    if (!skillsDir) {
      return undefined;
    }

    return {
      workdir: dirname(skillsDir),
      dir: basename(skillsDir)
    };
  }

  private async removeManagedPluginConfigEntry(pluginId: string): Promise<void> {
    const snapshot = await this.access.readOpenClawConfigSnapshot();

    if (!snapshot.config.plugins?.entries || !(pluginId in snapshot.config.plugins.entries)) {
      return;
    }

    delete snapshot.config.plugins.entries[pluginId];
    if (Object.keys(snapshot.config.plugins.entries).length === 0) {
      delete snapshot.config.plugins.entries;
    }
    if (snapshot.config.plugins && Object.keys(snapshot.config.plugins).length === 0) {
      delete snapshot.config.plugins;
    }

    await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
  }

  private async removeChannelConfig(channelKey: string): Promise<void> {
    const snapshot = await this.access.readOpenClawConfigSnapshot();

    if (!snapshot.config.channels || !(channelKey in snapshot.config.channels)) {
      return;
    }

    delete snapshot.config.channels[channelKey];
    if (Object.keys(snapshot.config.channels).length === 0) {
      delete snapshot.config.channels;
    }

    await this.access.writeOpenClawConfigSnapshot(snapshot.configPath, snapshot.config);
  }
}
