import type { EngineKind } from "@chillclaw/contracts";

import { openClawToolDefinitions } from "../config/capability-catalog.js";
import type { RuntimeToolAccess, RuntimeToolProviderPolicy, ToolManager } from "./adapter.js";

interface OpenClawToolsConfig {
  profile?: unknown;
  allow?: unknown;
  deny?: unknown;
  byProvider?: unknown;
}

interface OpenClawToolConfigSnapshot {
  config: {
    tools?: OpenClawToolsConfig;
  };
}

interface OpenClawToolAccessCoordinatorAccess {
  engine: EngineKind;
  readOpenClawConfigSnapshot: () => Promise<OpenClawToolConfigSnapshot>;
}

export class OpenClawToolAccessCoordinator implements ToolManager {
  constructor(private readonly access: OpenClawToolAccessCoordinatorAccess) {}

  async getRuntimeToolAccess(): Promise<RuntimeToolAccess> {
    const snapshot = await this.access.readOpenClawConfigSnapshot();
    const tools = snapshot.config.tools ?? {};
    const byProvider = normalizeProviderPolicy(tools.byProvider);
    const allow = normalizeStringList(tools.allow);
    const deny = normalizeStringList(tools.deny);

    return {
      engine: this.access.engine,
      profile: normalizeOptionalString(tools.profile),
      allow,
      deny,
      byProvider,
      entries: buildToolAccessEntries(allow, deny, byProvider)
    };
  }
}

function buildToolAccessEntries(
  allow: string[],
  deny: string[],
  byProvider: Record<string, RuntimeToolProviderPolicy>
): RuntimeToolAccess["entries"] {
  const definitionsById = new Map(openClawToolDefinitions.map((definition) => [definition.id, definition]));
  const explicitIds = new Set<string>();

  for (const id of [...allow, ...deny]) {
    explicitIds.add(id);
  }

  for (const provider of Object.values(byProvider)) {
    for (const id of [...(provider.allow ?? []), ...(provider.deny ?? [])]) {
      explicitIds.add(id);
    }
  }

  const entries = openClawToolDefinitions.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    label: definition.label,
    description: definition.description
  }));

  for (const id of [...explicitIds].sort()) {
    if (definitionsById.has(id)) {
      continue;
    }

    entries.push({
      id,
      kind: id.startsWith("group:") ? ("tool-group" as const) : ("tool" as const),
      label: humanizeToolId(id),
      description: `OpenClaw tool policy entry ${id}.`
    });
  }

  return entries;
}

function normalizeProviderPolicy(value: unknown): Record<string, RuntimeToolProviderPolicy> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, RuntimeToolProviderPolicy> = {};

  for (const [providerId, policy] of Object.entries(value as Record<string, unknown>)) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      continue;
    }

    const rawPolicy = policy as Record<string, unknown>;
    result[providerId] = {
      profile: normalizeOptionalString(rawPolicy.profile),
      allow: normalizeStringList(rawPolicy.allow),
      deny: normalizeStringList(rawPolicy.deny)
    };
  }

  return result;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item)))];
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function humanizeToolId(id: string): string {
  return id
    .replace(/^group:/, "")
    .replace(/^openclaw\./, "openclaw ")
    .split(/[-_.:]+/)
    .filter(Boolean)
    .map((part) => (part === "openclaw" ? "OpenClaw" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}
