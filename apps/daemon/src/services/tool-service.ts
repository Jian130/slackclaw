import type { CapabilityStatus, ToolEntry, ToolOverview } from "@chillclaw/contracts";

import type { EngineAdapter, RuntimeToolAccessEntry } from "../engine/adapter.js";

export class ToolService {
  constructor(private readonly adapter: EngineAdapter) {}

  async getOverview(): Promise<ToolOverview> {
    const access = await this.adapter.tools.getRuntimeToolAccess();
    const allow = new Set(access.allow);
    const deny = new Set(access.deny);
    const entries = access.entries.map((entry) => {
      const status = getToolStatus(entry, allow, deny, access.profile);
      return {
        id: entry.id,
        kind: entry.kind,
        engine: access.engine,
        label: entry.label,
        description: entry.description,
        status,
        summary: summarizeToolStatus(status),
        runtimeRef: {
          engine: access.engine,
          kind: entry.kind,
          id: entry.id
        }
      } satisfies ToolEntry;
    });

    return {
      engine: access.engine,
      checkedAt: new Date().toISOString(),
      profile: access.profile,
      allow: [...access.allow],
      deny: [...access.deny],
      byProvider: cloneProviderPolicy(access.byProvider),
      entries,
      summary: summarizeTools(entries)
    };
  }
}

function getToolStatus(
  entry: RuntimeToolAccessEntry,
  allow: Set<string>,
  deny: Set<string>,
  profile: string | undefined
): CapabilityStatus {
  const groupId = inferToolGroupId(entry.id);

  if (deny.has(entry.id) || (groupId ? deny.has(groupId) : false)) {
    return "blocked";
  }

  if (allow.has(entry.id) || (groupId ? allow.has(groupId) : false)) {
    return "ready";
  }

  if (profileCoversTool(profile, entry.id, groupId)) {
    return "ready";
  }

  return "unknown";
}

function inferToolGroupId(toolId: string): string | undefined {
  if (toolId.startsWith("group:")) {
    return toolId;
  }

  const [prefix] = toolId.split(".");
  if (!prefix) {
    return undefined;
  }

  if (["web", "fs", "runtime", "ui", "automation", "messaging", "media", "openclaw"].includes(prefix)) {
    return `group:${prefix}`;
  }

  return undefined;
}

function summarizeToolStatus(status: CapabilityStatus): string {
  switch (status) {
    case "ready":
      return "Allowed by global tool policy.";
    case "blocked":
      return "Denied by global tool policy.";
    default:
      return "No global allow or deny rule matched.";
  }
}

function profileCoversTool(profile: string | undefined, toolId: string, groupId: string | undefined): boolean {
  const coverage = profileCoverage(profile);

  if (coverage === "all") {
    return true;
  }

  if (!coverage) {
    return false;
  }

  return coverage.has(toolId) || (groupId ? coverage.has(groupId) : false);
}

function profileCoverage(profile: string | undefined): Set<string> | "all" | undefined {
  switch (profile) {
    case undefined:
    case "full":
      return "all";
    case "coding":
      return new Set([
        "group:fs",
        "group:runtime",
        "group:web",
        "group:sessions",
        "group:memory",
        "cron",
        "image",
        "image_generate",
        "music_generate",
        "video_generate"
      ]);
    case "messaging":
      return new Set(["group:messaging", "sessions_list", "sessions_history", "sessions_send", "session_status"]);
    case "minimal":
      return new Set(["session_status"]);
    default:
      return undefined;
  }
}

function summarizeTools(entries: ToolEntry[]): string {
  const ready = entries.filter((entry) => entry.status === "ready").length;
  const blocked = entries.filter((entry) => entry.status === "blocked").length;
  const unknown = entries.filter((entry) => entry.status === "unknown").length;

  if (entries.length === 0) {
    return "No tools found.";
  }

  return `${ready} ready · ${blocked} blocked · ${unknown} unknown.`;
}

function cloneProviderPolicy(providerPolicy: ToolOverview["byProvider"]): ToolOverview["byProvider"] {
  return Object.fromEntries(
    Object.entries(providerPolicy).map(([providerId, policy]) => [
      providerId,
      {
        profile: policy.profile,
        allow: policy.allow ? [...policy.allow] : undefined,
        deny: policy.deny ? [...policy.deny] : undefined
      }
    ])
  );
}
