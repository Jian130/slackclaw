import test from "node:test";
import assert from "node:assert/strict";

import type { ModelCatalogEntry } from "@slackclaw/contracts";

import { reconcileSavedEntriesWithRuntime } from "./openclaw-adapter.js";

test("reconcileSavedEntriesWithRuntime aligns saved entries with the live OpenClaw runtime chain", () => {
  const entries = [
    {
      id: "slackclaw-main",
      label: "OpenAI GPT-5.4",
      providerId: "openai",
      modelKey: "openai-codex/gpt-5.4",
      agentId: "main",
      agentDir: "/tmp/main",
      workspaceDir: "/tmp/workspace",
      authMethodId: "openai-codex",
      authModeLabel: "OAuth",
      profileLabel: "default",
      profileIds: ["openai-codex:default"],
      isDefault: true,
      isFallback: false,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    },
    {
      id: "fallback-anthropic",
      label: "Anthropic 4.6",
      providerId: "anthropic",
      modelKey: "anthropic/claude-sonnet-4-6",
      agentId: "anthropic-agent",
      agentDir: "/tmp/anthropic",
      workspaceDir: "/tmp/anthropic-workspace",
      authMethodId: "anthropic-api-key",
      authModeLabel: "API key",
      profileLabel: undefined,
      profileIds: [],
      isDefault: false,
      isFallback: true,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    },
    {
      id: "normal-anthropic",
      label: "Anthropic 4.6 Copy",
      providerId: "anthropic",
      modelKey: "anthropic/claude-sonnet-4-6",
      agentId: "anthropic-copy",
      agentDir: "/tmp/anthropic-copy",
      workspaceDir: "/tmp/anthropic-copy-workspace",
      authMethodId: "anthropic-api-key",
      authModeLabel: "API key",
      profileLabel: undefined,
      profileIds: [],
      isDefault: false,
      isFallback: false,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    },
    {
      id: "fallback-anthropic-45",
      label: "Anthropic 4.5",
      providerId: "anthropic",
      modelKey: "anthropic/claude-sonnet-4-5-20250929",
      agentId: "anthropic-45",
      agentDir: "/tmp/anthropic-45",
      workspaceDir: "/tmp/anthropic-45-workspace",
      authMethodId: "anthropic-api-key",
      authModeLabel: "API key",
      profileLabel: undefined,
      profileIds: [],
      isDefault: false,
      isFallback: false,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    }
  ];

  const configuredModels: ModelCatalogEntry[] = [
    {
      key: "vllm/qwen3.5-9b",
      name: "qwen3.5-9b",
      input: "text",
      contextWindow: 128000,
      local: true,
      available: true,
      tags: ["default", "configured"],
      missing: false
    },
    {
      key: "openai-codex/gpt-5.4",
      name: "gpt-5.4",
      input: "text+image",
      contextWindow: 272000,
      local: false,
      available: true,
      tags: ["fallback#1", "configured"],
      missing: false
    },
    {
      key: "anthropic/claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      input: "text+image",
      contextWindow: 200000,
      local: false,
      available: true,
      tags: ["fallback#2", "configured"],
      missing: false
    },
    {
      key: "anthropic/claude-sonnet-4-5-20250929",
      name: "Claude Sonnet 4.5",
      input: "text+image",
      contextWindow: 200000,
      local: false,
      available: true,
      tags: ["fallback#3", "configured"],
      missing: false
    }
  ];

  const reconciled = reconcileSavedEntriesWithRuntime(entries as never[], configuredModels, "vllm/qwen3.5-9b");

  assert.equal(reconciled.defaultEntryId, "runtime:vllm-qwen3-5-9b");
  assert.deepEqual(reconciled.fallbackEntryIds, [
    "slackclaw-main",
    "fallback-anthropic",
    "fallback-anthropic-45"
  ]);

  const runtimeDefault = reconciled.entries.find((entry) => entry.id === "runtime:vllm-qwen3-5-9b");
  assert.ok(runtimeDefault);
  assert.equal(runtimeDefault?.providerId, "vllm");
  assert.equal(runtimeDefault?.authModeLabel, "Local");
  assert.equal(runtimeDefault?.isDefault, true);

  const openAi = reconciled.entries.find((entry) => entry.id === "slackclaw-main");
  assert.equal(openAi?.isDefault, false);
  assert.equal(openAi?.isFallback, true);

  const duplicateAnthropic = reconciled.entries.find((entry) => entry.id === "normal-anthropic");
  assert.equal(duplicateAnthropic?.isFallback, false);
});
