import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { MockAdapter } from "./mock-adapter.js";

test("mock adapter supports saved model entry create, update, default, fallback, and remove flows", async () => {
  const adapter = new MockAdapter();
  const initial = await adapter.getModelConfig();
  const initialCount = initial.savedEntries.length;

  const created = await adapter.createSavedModelEntry({
    label: "OpenAI GPT-5 Copy",
    providerId: "openai",
    methodId: "api-key",
    modelKey: "openai/gpt-5",
    values: { apiKey: "sk-test" },
    makeDefault: false,
    useAsFallback: true
  });

  assert.equal(created.status, "completed");
  assert.equal(created.modelConfig.savedEntries.length, initialCount + 1);

  const createdEntry = created.modelConfig.savedEntries.find((entry) => entry.label === "OpenAI GPT-5 Copy");
  assert.ok(createdEntry);
  assert.equal(createdEntry.isFallback, true);

  const updated = await adapter.updateSavedModelEntry(createdEntry.id, {
    label: "OpenAI GPT-5 Alternate",
    providerId: "openai",
    methodId: "api-key",
    modelKey: "openai/gpt-5",
    values: {},
    makeDefault: true,
    useAsFallback: false
  });

  const updatedEntry = updated.modelConfig.savedEntries.find((entry) => entry.id === createdEntry.id);
  assert.ok(updatedEntry);
  assert.equal(updatedEntry.label, "OpenAI GPT-5 Alternate");
  assert.equal(updatedEntry.isDefault, true);

  const defaultResult = await adapter.setDefaultModelEntry({ entryId: initial.savedEntries[0].id });
  assert.equal(defaultResult.modelConfig.defaultEntryId, initial.savedEntries[0].id);

  const fallbackResult = await adapter.replaceFallbackModelEntries({ entryIds: [createdEntry.id] });
  assert.deepEqual(fallbackResult.modelConfig.fallbackEntryIds, [createdEntry.id]);

  const removed = await adapter.removeSavedModelEntry(initial.savedEntries[0].id);
  assert.equal(removed.modelConfig.savedEntries.length, initialCount);
  assert.equal(removed.modelConfig.defaultEntryId, createdEntry.id);
  assert.deepEqual(removed.modelConfig.fallbackEntryIds, []);
});

test("mock adapter keeps normal saved model entries metadata-only", async () => {
  const adapter = new MockAdapter();
  const created = await adapter.createSavedModelEntry({
    label: "OpenAI Normal Entry",
    providerId: "openai",
    methodId: "api-key",
    modelKey: "openai/gpt-5",
    values: {},
    makeDefault: false,
    useAsFallback: false
  });

  const entry = created.modelConfig.savedEntries.find((item) => item.label === "OpenAI Normal Entry");
  assert.ok(entry);
  assert.equal(entry.agentId, "");
  assert.equal(entry.isDefault, false);
  assert.equal(entry.isFallback, false);
});

test("mock adapter supports generic channel save and remove flows", async () => {
  const adapter = new MockAdapter();

  const saved = await adapter.saveChannelEntry({
    channelId: "telegram",
    action: "save",
    values: { token: "telegram-test-token", accountName: "Support Bot" }
  });
  assert.equal(saved.channel.status, "awaiting-pairing");

  const sessionResult = await adapter.saveChannelEntry({
    channelId: "whatsapp",
    action: "login",
    values: {}
  });
  assert.equal(sessionResult.session?.channelId, "whatsapp");

  const removed = await adapter.removeChannelEntry({ entryId: "telegram:default" });
  assert.equal(removed.channelId, "telegram");
  assert.equal((await adapter.getChannelState("telegram")).status, "not-started");
});

test("mock adapter supports target-specific uninstall flows", async () => {
  const adapter = new MockAdapter();

  const removed = await adapter.uninstallDeploymentTarget("standard");

  assert.equal(removed.targetId, "standard");
  assert.equal(removed.status, "completed");
  assert.equal(removed.engineStatus.installed, false);
});

test("mock adapter supports target-specific install flows", async () => {
  const adapter = new MockAdapter();

  const installed = await adapter.installDeploymentTarget("managed-local");

  assert.equal(installed.targetId, "managed-local");
  assert.equal(installed.status, "completed");
  assert.equal(installed.engineStatus.installed, true);
});

test("mock adapter supports skills runtime and marketplace flows", async () => {
  const adapter = new MockAdapter();

  const runtime = await adapter.getSkillRuntimeCatalog();
  assert.ok(runtime.skills.some((skill) => skill.id === "weather"));

  const detail = await adapter.getInstalledSkillDetail("Skill Finder - Search Skills");
  assert.equal(detail.managedBy, "clawhub");

  const searchResults = await adapter.searchSkillMarketplace("weather");
  assert.ok(searchResults.some((entry) => entry.slug === "weather-api"));

  await adapter.installMarketplaceSkill({ slug: "weather-api" });
  assert.ok((await adapter.getSkillRuntimeCatalog()).skills.some((skill) => skill.slug === "weather-api"));

  await adapter.saveCustomSkill(undefined, {
    name: "Internal Writer",
    slug: "internal-writer",
    description: "Draft internal updates.",
    instructions: "Draft internal updates.",
    homepage: "https://example.com"
  });
  assert.ok((await adapter.getSkillRuntimeCatalog()).skills.some((skill) => skill.slug === "internal-writer"));

  await adapter.removeInstalledSkill("internal-writer", { managedBy: "slackclaw-custom" });
  assert.equal((await adapter.getSkillRuntimeCatalog()).skills.some((skill) => skill.slug === "internal-writer"), false);
});

test("mock adapter supports AI member runtime lifecycle", async () => {
  const adapter = new MockAdapter();

  const runtime = await adapter.saveAIMemberRuntime({
    memberId: "member-1",
    name: "Alex Morgan",
    jobTitle: "Research Lead",
    avatar: {
      presetId: "operator",
      accent: "var(--avatar-1)",
      emoji: "🦊",
      theme: "sunrise"
    },
    personality: "Analytical",
    soul: "Keep work clear and grounded.",
    workStyles: ["Methodical"],
    skillIds: ["research-brief"],
    selectedSkills: [
      {
        id: "research-brief",
        label: "Research Brief",
        description: "Draft concise research summaries."
      }
    ],
    capabilitySettings: {
      memoryEnabled: true,
      contextWindow: 128000
    },
    knowledgePacks: [],
    brain: {
      entryId: "mock-openai-gpt-4o-mini",
      label: "OpenAI GPT-4o Mini",
      providerId: "openai",
      modelKey: "openai/gpt-4o-mini"
    }
  });

  assert.match(runtime.agentId, /^slackclaw-member-alex-morgan-\d{8}-\d{6}$/);
  assert.deepEqual(await adapter.getAIMemberBindings(runtime.agentId), []);
  assert.equal((await adapter.listAIMemberRuntimeCandidates())[0]?.agentId, runtime.agentId);

  const bindings = await adapter.bindAIMemberChannel(runtime.agentId, { binding: "telegram:default" });
  assert.deepEqual(bindings.map((binding) => binding.target), ["telegram:default"]);
  const afterUnbind = await adapter.unbindAIMemberChannel(runtime.agentId, { binding: "telegram:default" });
  assert.deepEqual(afterUnbind, []);

  await adapter.deleteAIMemberRuntime(runtime.agentId, { deleteMode: "keep-workspace" });
  assert.deepEqual(await adapter.getAIMemberBindings(runtime.agentId), []);
});

test("mock adapter keeps chat sessions isolated per thread", async () => {
  const adapter = new MockAdapter();

  await adapter.sendChatMessage({
    threadId: "thread-1",
    agentId: "member-agent-1",
    sessionKey: "agent:member-agent-1:slackclaw-chat:thread-1",
    message: "Summarize today's work."
  });

  await adapter.sendChatMessage({
    threadId: "thread-2",
    agentId: "member-agent-2",
    sessionKey: "agent:member-agent-2:slackclaw-chat:thread-2",
    message: "Draft tomorrow's plan."
  });
  await delay(30);

  const firstThread = await adapter.getChatThreadDetail({
    threadId: "thread-1",
    agentId: "member-agent-1",
    sessionKey: "agent:member-agent-1:slackclaw-chat:thread-1"
  });
  const secondThread = await adapter.getChatThreadDetail({
    threadId: "thread-2",
    agentId: "member-agent-2",
    sessionKey: "agent:member-agent-2:slackclaw-chat:thread-2"
  });

  assert.equal(firstThread.messages.some((message) => message.text.includes("Summarize today's work.")), true);
  assert.equal(firstThread.messages.some((message) => message.text.includes("Draft tomorrow's plan.")), false);
  assert.equal(secondThread.messages.some((message) => message.text.includes("Draft tomorrow's plan.")), true);
});
