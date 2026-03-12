import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  extractJsonPayload,
  openClawCompatibilitySources,
  summarizeAgentsList,
  summarizeChannelsList,
  summarizeChannelsStatus,
  summarizeModelsStatus
} from "./openclaw-compatibility.js";

const fixtureDir = resolve(process.cwd(), "src/engine/__fixtures__/openclaw/2026.3.7");

async function readFixture(filename: string) {
  return readFile(resolve(fixtureDir, filename), "utf8");
}

test("extractJsonPayload trims warning lines before a JSON payload", async () => {
  const raw = await readFixture("channels-list.stdout.txt");
  const payload = extractJsonPayload(raw);

  assert.equal(payload?.startsWith("{"), true);
});

test("channel list fixture produces configured channels and auth profiles", async () => {
  const raw = await readFixture("channels-list.stdout.txt");
  const summary = summarizeChannelsList(raw);

  assert.deepEqual(summary.configuredChannels, ["telegram", "whatsapp"]);
  assert.deepEqual(summary.authProfileIds, ["openai-codex:default"]);
});

test("channel status fixture produces channel order and running channels", async () => {
  const raw = await readFixture("channels-status-probe.stdout.txt");
  const summary = summarizeChannelsStatus(raw);

  assert.deepEqual(summary.channelOrder, ["telegram", "whatsapp"]);
  assert.equal(summary.configuredAccountCount, 2);
  assert.deepEqual(summary.runningChannels, ["telegram", "whatsapp"]);
});

test("agents list fixture resolves the default agent", async () => {
  const raw = await readFixture("agents-list.stdout.txt");
  const summary = summarizeAgentsList(raw);

  assert.deepEqual(summary.agentIds, ["main"]);
  assert.equal(summary.defaultAgentId, "main");
});

test("models status fixture resolves default model and fallback count", async () => {
  const raw = await readFixture("models-status.stdout.txt");
  const summary = summarizeModelsStatus(raw);

  assert.equal(summary.defaultModel, "openai-codex/gpt-5.4");
  assert.equal(summary.fallbackCount, 1);
  assert.equal(summary.allowedCount, 2);
  assert.deepEqual(summary.oauthProviders, ["openai-codex (1)"]);
});

test("every compatibility capability maps to a source area and file list", () => {
  assert.equal(Object.keys(openClawCompatibilitySources).length > 10, true);
  assert.equal(openClawCompatibilitySources["remove-model"].area, "Config / Models");
  assert.equal(openClawCompatibilitySources["remove-channel"].filePaths.includes("apps/daemon/src/server.ts"), true);
});
