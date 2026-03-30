import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { MockAdapter } from "../engine/mock-adapter.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { PresetSkillService } from "./preset-skill-service.js";
import { SkillService } from "./skill-service.js";
import { StateStore } from "./state-store.js";

function createService(testName: string, adapter = new MockAdapter(), options?: { withEvents?: boolean }) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const store = new StateStore(filePath);
  const bus = options?.withEvents ? new EventBusService() : undefined;
  const eventPublisher = bus ? new EventPublisher(bus) : undefined;
  const presetSkillService = new PresetSkillService(adapter, store, eventPublisher);

  return {
    adapter,
    store,
    presetSkillService,
    service: new SkillService(adapter, store, eventPublisher, presetSkillService),
    bus
  };
}

test("skill service returns live installed skills and marketplace preview", async () => {
  const { service } = createService("skills-overview");
  const overview = await service.getConfigOverview();

  assert.ok(overview.installedSkills.some((skill) => skill.id === "weather"));
  assert.ok(overview.marketplacePreview.some((entry) => entry.slug === "skill-finder"));
  assert.equal(overview.marketplaceAvailable, true);
});

test("skill service creates and edits SlackClaw custom skills", async () => {
  const { service, store } = createService("skills-custom");

  await service.saveCustomSkill(undefined, {
    name: "Internal SOP Writer",
    slug: "internal-sop-writer",
    description: "Draft internal SOPs.",
    instructions: "Write SOP drafts in plain language.",
    homepage: "https://example.com/sop"
  });

  let overview = await service.getConfigOverview();
  let created = overview.installedSkills.find((skill) => skill.slug === "internal-sop-writer");
  assert.ok(created);
  assert.equal(created?.managedBy, "slackclaw-custom");

  await service.updateSkill(created!.id, {
    action: "edit-custom",
    name: "Internal SOP Writer",
    description: "Draft and revise internal SOPs.",
    instructions: "Write and revise SOP drafts in plain language."
  });

  overview = await service.getConfigOverview();
  created = overview.installedSkills.find((skill) => skill.slug === "internal-sop-writer");
  assert.equal(created?.description, "Draft and revise internal SOPs.");
  assert.ok((await store.read()).skills?.customEntries["internal-sop-writer"]);
});

test("skill service updates and removes marketplace skills", async () => {
  const { service } = createService("skills-marketplace");

  await service.installMarketplaceSkill({ slug: "weather-api" });
  let overview = await service.getConfigOverview();
  let installed = overview.installedSkills.find((skill) => skill.slug === "weather-api");
  assert.ok(installed);
  assert.equal(installed?.managedBy, "clawhub");

  await service.updateSkill(installed!.id, { action: "update", version: "1.0.2" });
  overview = await service.getConfigOverview();
  installed = overview.installedSkills.find((skill) => skill.slug === "weather-api");
  assert.equal(installed?.version, "1.0.2");

  await service.removeSkill(installed!.id);
  overview = await service.getConfigOverview();
  assert.equal(overview.installedSkills.some((skill) => skill.slug === "weather-api"), false);
});

test("skill service publishes snapshot events for install, update, and remove", async () => {
  const { service, bus } = createService("skills-events", new MockAdapter(), { withEvents: true });
  const events: string[] = [];
  bus?.subscribe((event) => {
    events.push(event.type);
  });

  await service.installMarketplaceSkill({ slug: "weather-api" });

  let overview = await service.getConfigOverview();
  const installed = overview.installedSkills.find((skill) => skill.slug === "weather-api");
  assert.ok(installed);

  await service.updateSkill(installed!.id, { action: "update", version: "1.0.2" });
  await service.removeSkill(installed!.id);

  assert.deepEqual(events, [
    "skill-catalog.updated",
    "skill-catalog.updated",
    "skill-catalog.updated"
  ]);
});

test("skill service can repair preset skill sync and returns the updated overview", async () => {
  const { service, presetSkillService } = createService("skills-preset-repair");

  await presetSkillService.setDesiredPresetSkillIds("onboarding", ["research-brief"]);
  const response = await service.repairPresetSkillSync();

  assert.equal(response.status, "completed");
  assert.equal(response.skillConfig.presetSkillSync?.entries[0]?.status, "verified");
});
