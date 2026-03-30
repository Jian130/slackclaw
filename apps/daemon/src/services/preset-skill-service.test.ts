import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { MockAdapter } from "../engine/mock-adapter.js";
import type { SkillRuntimeEntry } from "../engine/adapter.js";
import { PresetSkillService } from "./preset-skill-service.js";
import { StateStore } from "./state-store.js";

function createRuntimeSkill(slug: string, version = "1.0.0"): SkillRuntimeEntry {
  return {
    id: `${slug}-runtime`,
    slug,
    name: slug,
    description: `${slug} skill.`,
    source: "openclaw-workspace",
    bundled: false,
    eligible: true,
    disabled: false,
    blockedByAllowlist: false,
    missing: {
      bins: [],
      anyBins: [],
      env: [],
      config: [],
      os: []
    },
    version,
    filePath: `/mock/skills/${slug}/SKILL.md`,
    baseDir: `/mock/skills/${slug}`
  };
}

function createService(testName: string) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  const bus = new EventBusService();
  const publisher = new EventPublisher(bus);
  const adapter = new MockAdapter();
  const installed = new Map<string, SkillRuntimeEntry>();
  const installCalls: string[] = [];
  const verifyCalls: string[] = [];

  Object.assign(adapter.config, {
    installManagedSkill: async (request: { slug: string; version?: string }) => {
      installCalls.push(request.slug);
      const runtimeSkill = createRuntimeSkill(request.slug, request.version ?? "1.0.0");
      installed.set(request.slug, runtimeSkill);
      return {
        runtimeSkillId: runtimeSkill.id,
        version: runtimeSkill.version,
        requiresGatewayApply: true
      };
    },
    verifyManagedSkill: async (slug: string) => {
      verifyCalls.push(slug);
      return installed.get(slug);
    }
  });

  return {
    service: new PresetSkillService(adapter, store, publisher),
    adapter,
    store,
    bus,
    installCalls,
    verifyCalls
  };
}

test("preset skill service reconciles desired skills and persists verified sync state", async () => {
  const { service, store, bus, installCalls, verifyCalls } = createService("preset-skill-success");
  const statuses: string[] = [];

  bus.subscribe((event) => {
    if (event.type === "preset-skill-sync.updated") {
      statuses.push(event.snapshot.data.entries.map((entry) => entry.status).join(","));
    }
  });

  const overview = await service.setDesiredPresetSkillIds("onboarding", ["research-brief"], {
    targetMode: "reused-install"
  });
  const persisted = await store.read();

  assert.equal(installCalls.length, 1);
  assert.deepEqual(verifyCalls, ["research-brief", "research-brief"]);
  assert.equal(overview.targetMode, "reused-install");
  assert.equal(overview.entries[0]?.status, "verified");
  assert.equal(overview.entries[0]?.installedVersion, "1.0.0");
  assert.equal(persisted.presetSkills?.syncOverview?.entries[0]?.status, "verified");
  assert.equal(persisted.presetSkills?.targetMode, "reused-install");
  assert.equal(persisted.presetSkills?.selections.onboarding?.presetSkillIds[0], "research-brief");
  assert.equal(statuses.includes("pending"), true);
  assert.equal(statuses.includes("installing"), true);
  assert.equal(statuses.includes("installed"), true);
  assert.equal(statuses.includes("verified"), true);
});

test("preset skill service passes bundled asset locations to the managed install path", async () => {
  const { service, adapter, installCalls } = createService("preset-skill-bundled-asset");
  let bundledAssetPath: string | undefined;

  Object.assign(adapter.config, {
    installManagedSkill: async (request: { slug: string; bundledAssetPath?: string }) => {
      installCalls.push(request.slug);
      bundledAssetPath = request.bundledAssetPath;
      return {
        runtimeSkillId: `${request.slug}-runtime`,
        version: "1.0.0",
        requiresGatewayApply: false
      };
    }
  });

  await service.reconcilePresetSkills({
    targetMode: "managed-local",
    presetSkillIds: ["research-brief"]
  });

  assert.equal(installCalls.length, 1);
  assert.equal(typeof bundledAssetPath, "string");
});

test("preset skill service treats unusable runtime skills as failed verification", async () => {
  const { service, adapter } = createService("preset-skill-unusable-runtime");

  Object.assign(adapter.config, {
    verifyManagedSkill: async (slug: string) =>
      slug === "research-brief"
        ? {
            ...createRuntimeSkill(slug),
            eligible: false,
            disabled: true
          }
        : undefined
  });

  const overview = await service.reconcilePresetSkills({
    targetMode: "managed-local",
    presetSkillIds: ["research-brief"]
  });

  assert.equal(overview.entries[0]?.status, "failed");
  assert.equal(overview.repairRecommended, true);
});

test("preset skill service marks unknown preset skills as failed without attempting install", async () => {
  const { service, store, installCalls } = createService("preset-skill-unknown");

  const overview = await service.reconcilePresetSkills({
    targetMode: "managed-local",
    presetSkillIds: ["does-not-exist"]
  });
  const persisted = await store.read();

  assert.equal(installCalls.length, 0);
  assert.equal(overview.entries[0]?.status, "failed");
  assert.equal(overview.entries[0]?.lastError, "Unknown preset skill.");
  assert.equal(overview.repairRecommended, true);
  assert.equal(persisted.presetSkills?.syncOverview?.entries[0]?.status, "failed");
});
