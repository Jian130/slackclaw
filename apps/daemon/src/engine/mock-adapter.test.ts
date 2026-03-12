import test from "node:test";
import assert from "node:assert/strict";

import { MockAdapter } from "./mock-adapter.js";

test("mock adapter supports saved model entry create, update, default, and fallback flows", async () => {
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
