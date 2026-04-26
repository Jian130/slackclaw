import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { ModelCatalogEntry, RuntimeActionResponse } from "@chillclaw/contracts";

import {
  OpenClawAdapter,
  buildGatewaySocketConnectParams,
  isGlobalNpmManagedOpenClawCommand,
  isVisibleAIMemberAgentId,
  parseClawHubExploreOutput,
  parseClawHubSearchOutput,
  removeRuntimeDerivedModelFromConfig,
  reconcileSavedEntriesWithRuntime,
  resolveCatalogModelKey
} from "./openclaw-adapter.js";
import { InMemorySecretsAdapter, modelAuthSecretName } from "../platform/secrets-adapter.js";
import type { RuntimeManager } from "../runtime-manager/runtime-manager.js";

const execFile = promisify(execFileCallback);

function mockProcessPlatform(platform: NodeJS.Platform): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    enumerable: originalDescriptor?.enumerable ?? true,
    value: platform
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(process, "platform", originalDescriptor);
    }
  };
}

test("reconcileSavedEntriesWithRuntime aligns saved entries with the live OpenClaw runtime chain", () => {
  const entries = [
    {
      id: "chillclaw-main",
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
    "runtime:openai-codex-gpt-5-4",
    "fallback-anthropic",
    "fallback-anthropic-45"
  ]);

  const runtimeDefault = reconciled.entries.find((entry) => entry.id === "runtime:vllm-qwen3-5-9b");
  assert.ok(runtimeDefault);
  assert.equal(runtimeDefault?.providerId, "vllm");
  assert.equal(runtimeDefault?.authModeLabel, "Local");
  assert.equal(runtimeDefault?.isDefault, true);

  const openAi = reconciled.entries.find((entry) => entry.id === "runtime:openai-codex-gpt-5-4");
  assert.equal(openAi?.isDefault, false);
  assert.equal(openAi?.isFallback, true);
  assert.equal(openAi?.agentId, "");
  assert.equal(openAi?.agentDir, "");
  assert.equal(openAi?.workspaceDir, "");

  const duplicateAnthropic = reconciled.entries.find((entry) => entry.id === "normal-anthropic");
  assert.equal(duplicateAnthropic, undefined);
});

test("reconcileSavedEntriesWithRuntime converts implicit main entries into runtime-derived defaults", () => {
  const entries = [
    {
      id: "chillclaw-main",
      label: "OpenAI GPT-5",
      providerId: "openai",
      modelKey: "openai/gpt-5",
      agentId: "main",
      agentDir: "/tmp/main-agent",
      workspaceDir: "/tmp/main-workspace",
      authMethodId: "openai-codex",
      authModeLabel: "OAuth",
      profileLabel: "default",
      profileIds: ["openai-codex:default"],
      isDefault: true,
      isFallback: false,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    }
  ];

  const configuredModels: ModelCatalogEntry[] = [
    {
      key: "openai/gpt-5",
      name: "GPT-5",
      input: "text+image",
      contextWindow: 400000,
      local: false,
      available: true,
      tags: ["default", "configured"],
      missing: false
    }
  ];

  const reconciled = reconcileSavedEntriesWithRuntime(entries as never[], configuredModels, "openai/gpt-5");

  assert.equal(reconciled.defaultEntryId, "runtime:openai-gpt-5");
  assert.deepEqual(reconciled.fallbackEntryIds, []);
  assert.deepEqual(reconciled.entries.map((entry) => entry.id), ["runtime:openai-gpt-5"]);
  assert.equal(reconciled.entries[0]?.agentId, "");
  assert.equal(reconciled.entries[0]?.agentDir, "");
  assert.equal(reconciled.entries[0]?.workspaceDir, "");
  assert.deepEqual(reconciled.entries[0]?.profileIds, []);
});

test("reconcileSavedEntriesWithRuntime backfills local auth metadata for runtime-derived Ollama entries", () => {
  const entries = [
    {
      id: "runtime:ollama-gemma4-e2b",
      label: "Ollama gemma4:e2b",
      providerId: "ollama",
      modelKey: "ollama/gemma4:e2b",
      agentId: "",
      agentDir: "",
      workspaceDir: "",
      authMethodId: undefined,
      authModeLabel: undefined,
      profileLabel: undefined,
      profileIds: [],
      isDefault: true,
      isFallback: false,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    }
  ];
  const configuredModels: ModelCatalogEntry[] = [
    {
      key: "ollama/gemma4:e2b",
      name: "gemma4:e2b",
      input: "text",
      contextWindow: 131072,
      local: true,
      available: true,
      tags: ["default", "configured"],
      missing: false
    }
  ];

  const reconciled = reconcileSavedEntriesWithRuntime(entries as never[], configuredModels, "ollama/gemma4:e2b");
  const localEntry = reconciled.entries[0];

  assert.equal(localEntry?.id, "runtime:ollama-gemma4-e2b");
  assert.equal(localEntry?.authMethodId, "ollama-local");
  assert.equal(localEntry?.authModeLabel, "Local");
  assert.equal(reconciled.defaultEntryId, "runtime:ollama-gemma4-e2b");
});

test("removeRuntimeDerivedModelFromConfig clears a last default runtime model", () => {
  const config = {
    agents: {
      defaults: {
        model: {
          primary: "minimax/MiniMax-M2.5",
          fallbacks: []
        },
        models: {
          "minimax/MiniMax-M2.5": {}
        },
        workspace: "/tmp/openclaw-workspace"
      }
    }
  };

  const result = removeRuntimeDerivedModelFromConfig(config, undefined, "minimax/MiniMax-M2.5");

  assert.equal(result.changed, true);
  assert.equal(result.removedDefault, true);
  assert.deepEqual(result.remainingModelKeys, []);
  assert.equal(config.agents?.defaults?.model, undefined);
  assert.equal(config.agents?.defaults?.models, undefined);
  assert.equal(config.agents?.defaults?.workspace, "/tmp/openclaw-workspace");
});

test("removeRuntimeDerivedModelFromConfig promotes the first fallback when removing the default", () => {
  const config = {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-5",
          fallbacks: ["anthropic/claude-sonnet-4-6", "google/gemini-2.5-pro"]
        },
        models: {
          "openai/gpt-5": {},
          "anthropic/claude-sonnet-4-6": {},
          "google/gemini-2.5-pro": {}
        }
      }
    }
  };

  const result = removeRuntimeDerivedModelFromConfig(config, undefined, "openai/gpt-5");

  assert.equal(result.changed, true);
  assert.equal(result.removedDefault, true);
  assert.deepEqual(result.remainingModelKeys, [
    "anthropic/claude-sonnet-4-6",
    "google/gemini-2.5-pro"
  ]);
  assert.deepEqual(config.agents?.defaults?.model, {
    primary: "anthropic/claude-sonnet-4-6",
    fallbacks: ["google/gemini-2.5-pro"]
  });
});

test("resolveCatalogModelKey upgrades the stale MiniMax onboarding default to the supported live catalog model", () => {
  const models: ModelCatalogEntry[] = [
    {
      key: "minimax/MiniMax-M2.7",
      name: "MiniMax-M2.7",
      input: "text",
      contextWindow: 128000,
      local: false,
      available: true,
      tags: ["configured"],
      missing: false
    },
    {
      key: "minimax/minimax-text-01",
      name: "MiniMax Text 01",
      input: "text",
      contextWindow: 128000,
      local: false,
      available: true,
      tags: [],
      missing: false
    }
  ];

  assert.equal(
    resolveCatalogModelKey(models, "minimax/MiniMax-M2.5", { providerId: "minimax" }),
    "minimax/MiniMax-M2.7"
  );
});

test("AI member detection includes every real OpenClaw agent id", () => {
  assert.equal(isVisibleAIMemberAgentId("main"), false);
  assert.equal(isVisibleAIMemberAgentId("chillclaw-model-openai"), false);
  assert.equal(isVisibleAIMemberAgentId("sales-partner"), true);
  assert.equal(isVisibleAIMemberAgentId(""), false);
});

test("npm-managed OpenClaw detection only matches the expected global npm command path", () => {
  assert.equal(
    isGlobalNpmManagedOpenClawCommand(
      "/opt/homebrew/bin/openclaw",
      "/opt/homebrew",
      "/opt/homebrew/lib/node_modules",
      true
    ),
    true
  );
  assert.equal(
    isGlobalNpmManagedOpenClawCommand(
      "/usr/local/bin/openclaw",
      "/opt/homebrew",
      "/opt/homebrew/lib/node_modules",
      true
    ),
    false
  );
  assert.equal(
    isGlobalNpmManagedOpenClawCommand(
      "/opt/homebrew/bin/openclaw",
      "/opt/homebrew",
      "/opt/homebrew/lib/node_modules",
      false
    ),
    false
  );
});

test("AI member discovery tolerates mixed plugin logs and preserves runtime metadata", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const members = await adapter.aiEmployees.listAIMemberRuntimeCandidates();

    assert.equal(members.length, 1);
    assert.deepEqual(
      members.map((member) => member.agentId),
      ["existing-agent"]
    );
    assert.equal(members[0]?.name, "Existing Agent");
    assert.equal(members[0]?.emoji, "🧭");
    assert.equal(members[0]?.bindingCount, 2);
  });
});

test("AI member discovery falls back to stderr when OpenClaw writes JSON there", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const members = await adapter.aiEmployees.listAIMemberRuntimeCandidates();

    assert.equal(members.length, 1);
    assert.deepEqual(
      members.map((member) => member.agentId),
      ["stderr-agent"]
    );
    assert.equal(members[0]?.bindingCount, 1);
  }, {
    agentsListJsonOnStderr: true
  });
});

test("AI member discovery ignores stale ChillClaw-managed agents after runtime uninstall reset removes their workspace", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const members = await adapter.aiEmployees.listAIMemberRuntimeCandidates();

    assert.deepEqual(
      members.map((member) => member.agentId),
      ["existing-agent"]
    );
  }, {
    staleManagedMemberAgent: true
  });
});

test("buildGatewaySocketConnectParams matches the current OpenClaw connect schema", () => {
  const params = buildGatewaySocketConnectParams({
    token: "gateway-token",
    platform: "darwin",
    clientVersion: "0.1.2"
  });

  assert.deepEqual(params, {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "gateway-client",
      displayName: "ChillClaw daemon",
      version: "0.1.2",
      platform: "darwin",
      mode: "backend"
    },
    caps: ["tool-events"],
    auth: {
      token: "gateway-token"
    },
    role: "operator",
    scopes: ["operator.read", "operator.write"]
  });
});

test("parseClawHubSearchOutput parses search rows", () => {
  const parsed = parseClawHubSearchOutput(`- Searching\nweather  Weather  (3.859)\nweather-api  Weather Api  (3.437)`);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.slug, "weather");
  assert.equal(parsed[1]?.name, "Weather Api");
});

test("parseClawHubExploreOutput parses latest skill rows", () => {
  const parsed = parseClawHubExploreOutput(`- Fetching latest skills\nskill-finder  v1.1.5  just now  Find and compare skills.\nweather-api  v1.0.1  2 days ago  Query weather data.`);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.slug, "skill-finder");
  assert.equal(parsed[0]?.latestVersion, "1.1.5");
  assert.equal(parsed[1]?.summary, "Query weather data.");
});

let fakeOpenClawLock: Promise<void> = Promise.resolve();

async function withFakeOpenClaw(
  fn: (context: { adapter: OpenClawAdapter; logPath: string; configPath: string; dataDir: string }) => Promise<void>,
  options?: {
    updateNoChange?: boolean;
    updatePackageManager?: "npm" | "pnpm" | "bun";
    chatHistoryPayload?: string;
    slowModelReads?: boolean;
    agentsListJsonOnStderr?: boolean;
    cleanModelRuntime?: boolean;
    failTelegramChannelsAdd?: boolean;
    failFeishuConfigSet?: boolean;
    failWechatConfigSet?: boolean;
    invalidLegacyWechatConfig?: boolean;
    canonicalWecomRuntime?: boolean;
    legacyWechatRuntime?: boolean;
    openclawWeixinRuntime?: boolean;
    failPersonalWechatDelete?: boolean;
    failPersonalWechatBindingAlias?: boolean;
    bindingsUseMatchShape?: boolean;
    failGatewayRestartWithPluginsAllowWarning?: boolean;
    longRunningWechatLogin?: boolean;
    pluginInstalled?: boolean;
    pluginEnabled?: boolean;
    pluginUpdateAvailable?: boolean;
    gatewayServiceLoaded?: boolean;
    minimaxCatalog?: boolean;
    omitModelStatusConfigPath?: boolean;
    staleManagedMemberAgent?: boolean;
    bindConflictWithStaleOwner?: boolean;
    systemOpenClawVersion?: string;
    managedOpenClawVersion?: string;
  }
): Promise<void> {
  const previousLock = fakeOpenClawLock;
  let releaseLock = () => {};
  fakeOpenClawLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-openclaw-cache-test-"));
  const logPath = join(tempDir, "openclaw.log");
  const configPath = join(tempDir, "openclaw.json");
  const versionPath = join(tempDir, "version.txt");
  const updateMarkerPath = join(tempDir, "update-marker.txt");
  const pluginInstalledMarkerPath = join(tempDir, "plugin-installed.txt");
  const pluginEnabledMarkerPath = join(tempDir, "plugin-enabled.txt");
  const pluginUpdateMarkerPath = join(tempDir, "plugin-update-marker.txt");
  const gatewayServiceMarkerPath = join(tempDir, "gateway-service.txt");
  const gatewayRunningMarkerPath = join(tempDir, "gateway-running.txt");
  const bindingsPath = join(tempDir, "agent-bindings.txt");
  const binDir = join(tempDir, "bin");
  const npmPath = join(binDir, "npm");
  const agentDirPath = join(tempDir, "main-agent");
  const dataDir = join(tempDir, "data");
  const binaryPath = join(dataDir, "openclaw-runtime", "node_modules", ".bin", "openclaw");
  const originalPath = process.env.PATH;
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalLogPath = process.env.OPENCLAW_TEST_LOG;
  const originalVersionPath = process.env.OPENCLAW_TEST_VERSION_FILE;
  const originalUpdateMarkerPath = process.env.OPENCLAW_TEST_UPDATE_MARKER;
  const originalPluginInstalledMarkerPath = process.env.OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER;
  const originalPluginEnabledMarkerPath = process.env.OPENCLAW_TEST_PLUGIN_ENABLED_MARKER;
  const originalPluginUpdateMarkerPath = process.env.OPENCLAW_TEST_PLUGIN_UPDATE_MARKER;
  const updateNoChange = options?.updateNoChange === true;
  const updatePackageManager = options?.updatePackageManager ?? "npm";
  const slowModelReads = options?.slowModelReads === true;
  const agentsListJsonOnStderr = options?.agentsListJsonOnStderr === true;
  const cleanModelRuntime = options?.cleanModelRuntime === true;
  const failTelegramChannelsAdd = options?.failTelegramChannelsAdd === true;
  const failFeishuConfigSet = options?.failFeishuConfigSet === true;
  const failWechatConfigSet = options?.failWechatConfigSet === true;
  const invalidLegacyWechatConfig = options?.invalidLegacyWechatConfig === true;
  const canonicalWecomRuntime = options?.canonicalWecomRuntime === true;
  const legacyWechatRuntime = options?.legacyWechatRuntime === true;
  const openclawWeixinRuntime = options?.openclawWeixinRuntime === true;
  const failPersonalWechatDelete = options?.failPersonalWechatDelete === true;
  const failPersonalWechatBindingAlias = options?.failPersonalWechatBindingAlias === true;
  const bindingsUseMatchShape = options?.bindingsUseMatchShape === true;
  const failGatewayRestartWithPluginsAllowWarning = options?.failGatewayRestartWithPluginsAllowWarning === true;
  const longRunningWechatLogin = options?.longRunningWechatLogin === true;
  const pluginInstalled = options?.pluginInstalled === true;
  const pluginEnabled = options?.pluginEnabled === true;
  const pluginUpdateAvailable = options?.pluginUpdateAvailable === true;
  const gatewayServiceLoaded = options?.gatewayServiceLoaded !== false;
  const minimaxCatalog = options?.minimaxCatalog === true;
  const omitModelStatusConfigPath = options?.omitModelStatusConfigPath === true;
  const staleManagedMemberAgent = options?.staleManagedMemberAgent === true;
  const bindConflictWithStaleOwner = options?.bindConflictWithStaleOwner === true;
  const systemOpenClawVersion = options?.systemOpenClawVersion;
  const managedOpenClawVersion = options?.managedOpenClawVersion ?? "2026.3.7";
  const chatHistoryPayload =
    options?.chatHistoryPayload ??
    '{"sessionKey":"agent:existing-agent:chillclaw-chat:thread-1","messages":[{"role":"assistant","content":[{"type":"text","text":"Hello from OpenClaw"}],"timestamp":1773000000000}]}';

  await writeFile(
    configPath,
    JSON.stringify(
      bindConflictWithStaleOwner
        ? {
            bindings: [
              {
                type: "route",
                agentId: "chillclaw-member-smart-ryo-20260412-122127",
                match: {
                  channel: "openclaw-weixin",
                  accountId: "default"
                }
              }
            ]
          }
        : {}
    )
  );
  await writeFile(versionPath, `${managedOpenClawVersion}\n`);
  await mkdir(agentDirPath, { recursive: true });
  await writeFile(
    join(agentDirPath, "auth-profiles.json"),
    JSON.stringify(
      {
        version: 1,
        profiles: {
          "openai-codex:default": {
            provider: "openai-codex",
            type: "oauth",
            label: "OpenAI Codex OAuth"
          }
        },
        usageStats: {},
        order: {
          "openai-codex": ["openai-codex:default"]
        },
        lastGood: {
          "openai-codex": "openai-codex:default"
        }
      },
      null,
      2
    )
  );
  if (pluginInstalled) {
    await writeFile(pluginInstalledMarkerPath, "1\n");
  }
  if (pluginEnabled) {
    await writeFile(pluginEnabledMarkerPath, "1\n");
  }
  if (pluginUpdateAvailable) {
    await writeFile(pluginUpdateMarkerPath, "1\n");
  }
  if (gatewayServiceLoaded) {
    await writeFile(gatewayServiceMarkerPath, "1\n");
    await writeFile(gatewayRunningMarkerPath, "1\n");
  }
  if (bindConflictWithStaleOwner) {
    await writeFile(bindingsPath, "chillclaw-member-smart-ryo-20260412-122127|openclaw-weixin:default\n");
  }
  await mkdir(agentDirPath, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await mkdir(join(dataDir, "openclaw-runtime", "node_modules", ".bin"), { recursive: true });
  await writeFile(
    npmPath,
    `#!/bin/sh
echo "$0 $*" >> "$OPENCLAW_TEST_LOG"
if [ "$1" = "--version" ]; then
  echo '10.9.0'
  exit 0
fi
exit 1
`
  );
  await chmod(npmPath, 0o755);
  if (systemOpenClawVersion) {
    await writeFile(
      join(binDir, "openclaw"),
      `#!/bin/sh
echo "system $*" >> "$OPENCLAW_TEST_LOG"
if [ "$1" = "--version" ]; then
  echo ${JSON.stringify(systemOpenClawVersion)}
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  echo '{"setup":{"required":false},"gateway":{"reachable":true},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"rpc":{"ok":true},"service":{"installed":true,"loaded":true}}'
elif [ "$1" = "models" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"configPath":${JSON.stringify(configPath)},"agentDir":${JSON.stringify(agentDirPath)},"auth":{"providers":[],"oauth":{"providers":[]}}}'
else
  echo '{}'
fi
`
    );
    await chmod(join(binDir, "openclaw"), 0o755);
  }
  await writeFile(
    binaryPath,
    `#!/bin/sh
echo "$*" >> "$OPENCLAW_TEST_LOG"
if [ "$1" = "--version" ]; then
  cat "$OPENCLAW_TEST_VERSION_FILE"
elif [ "${invalidLegacyWechatConfig ? "1" : "0"}" = "1" ] && grep -q '"wecom-openclaw-plugin"' ${JSON.stringify(configPath)}; then
  >&2 echo 'Invalid config at ${configPath}:'
  >&2 echo '- channels.wecom-openclaw-plugin: unknown channel id: wecom-openclaw-plugin'
  >&2 echo 'Config invalid'
  >&2 echo 'File: ~/.openclaw/openclaw.json'
  >&2 echo 'Problem:'
  >&2 echo '- channels.wecom-openclaw-plugin: unknown channel id: wecom-openclaw-plugin'
  >&2 echo
  >&2 echo 'Run: openclaw doctor --fix'
  exit 1
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  if [ -f ${JSON.stringify(gatewayRunningMarkerPath)} ]; then
    echo '{"setup":{"required":false},"gateway":{"reachable":true},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
  elif [ -f ${JSON.stringify(gatewayServiceMarkerPath)} ]; then
    echo '{"setup":{"required":false},"gateway":{"reachable":false},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
  else
    echo '{"setup":{"required":false},"gateway":{"reachable":false},"gatewayService":{"installed":false},"providers":{"summary":{"missingProfiles":0}}}'
  fi
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  if [ -f ${JSON.stringify(gatewayRunningMarkerPath)} ]; then
    echo '{"rpc":{"ok":true},"service":{"installed":true,"loaded":true}}'
  elif [ -f ${JSON.stringify(gatewayServiceMarkerPath)} ]; then
    echo '{"rpc":{"ok":false},"service":{"installed":true,"loaded":true}}'
  else
    echo '{"rpc":{"ok":false},"service":{"installed":false,"loaded":false}}'
  fi
elif [ "$1" = "update" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  if [ -f "$OPENCLAW_TEST_UPDATE_MARKER" ]; then
    echo '{"availability":{"available":false},"update":{"installKind":"package","packageManager":"${updatePackageManager}","registry":{"latestVersion":"2026.3.12"}},"channel":{"label":"stable"}}'
  else
    echo '{"availability":{"available":true,"latestVersion":"2026.3.12"},"update":{"installKind":"package","packageManager":"${updatePackageManager}","registry":{"latestVersion":"2026.3.12"}},"channel":{"label":"stable"}}'
  fi
elif [ "$1" = "update" ] && [ "$2" = "--json" ] && [ "$3" = "--yes" ] && [ "$4" = "--no-restart" ] && [ "$5" = "--tag" ] && [ "$6" = "latest" ]; then
  touch "$OPENCLAW_TEST_UPDATE_MARKER"
  if [ "${updateNoChange ? "1" : "0"}" = "1" ]; then
    echo '{"currentVersion":"2026.3.7","targetVersion":"2026.3.12","changed":true}'
  else
    echo "2026.3.12" > "$OPENCLAW_TEST_VERSION_FILE"
    echo '{"currentVersion":"2026.3.7","targetVersion":"2026.3.12","changed":true}'
  fi
elif [ "$1" = "models" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  if [ "${slowModelReads ? "1" : "0"}" = "1" ]; then
    sleep 1
  fi
  if [ "${cleanModelRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"models":[]}'
  elif [ "${minimaxCatalog ? "1" : "0"}" = "1" ]; then
    echo '{"models":[{"key":"minimax/MiniMax-M2.7","name":"MiniMax-M2.7","input":"text","contextWindow":400000,"local":false,"available":true,"tags":["default","configured"],"missing":false},{"key":"anthropic/claude-sonnet-4-6","name":"Claude Sonnet 4.6","input":"text+image","contextWindow":200000,"local":false,"available":true,"tags":["fallback#1","configured"],"missing":false}]}'
  else
    echo '{"models":[{"key":"openai/gpt-5","name":"GPT-5","input":"text","contextWindow":400000,"local":false,"available":true,"tags":["default","configured"],"missing":false},{"key":"anthropic/claude-sonnet-4-6","name":"Claude Sonnet 4.6","input":"text+image","contextWindow":200000,"local":false,"available":true,"tags":["fallback#1","configured"],"missing":false}]}'
  fi
elif [ "$1" = "models" ] && [ "$2" = "list" ] && [ "$3" = "--all" ] && [ "$4" = "--json" ]; then
  if [ "${slowModelReads ? "1" : "0"}" = "1" ]; then
    sleep 1
  fi
  if [ "${minimaxCatalog ? "1" : "0"}" = "1" ]; then
    echo '{"models":[{"key":"minimax/MiniMax-M2.7","name":"MiniMax-M2.7","input":"text","contextWindow":400000,"local":false,"available":true,"tags":["default","configured"],"missing":false},{"key":"anthropic/claude-sonnet-4-6","name":"Claude Sonnet 4.6","input":"text+image","contextWindow":200000,"local":false,"available":true,"tags":["fallback#1","configured"],"missing":false},{"key":"google/gemini-2.5-pro","name":"Gemini 2.5 Pro","input":"text+image","contextWindow":1000000,"local":false,"available":true,"tags":[],"missing":false}]}'
  else
    echo '{"models":[{"key":"openai/gpt-5","name":"GPT-5","input":"text","contextWindow":400000,"local":false,"available":true,"tags":["default","configured"],"missing":false},{"key":"anthropic/claude-sonnet-4-6","name":"Claude Sonnet 4.6","input":"text+image","contextWindow":200000,"local":false,"available":true,"tags":["fallback#1","configured"],"missing":false},{"key":"google/gemini-2.5-pro","name":"Gemini 2.5 Pro","input":"text+image","contextWindow":1000000,"local":false,"available":true,"tags":[],"missing":false}]}'
  fi
elif [ "$1" = "models" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  if [ "${slowModelReads ? "1" : "0"}" = "1" ]; then
    sleep 1
  fi
  if [ "${cleanModelRuntime ? "1" : "0"}" = "1" ]; then
    if [ "${omitModelStatusConfigPath ? "1" : "0"}" = "1" ]; then
      echo '{"agentDir":${JSON.stringify(agentDirPath)},"auth":{"providers":[],"oauth":{"providers":[]}}}'
    else
      echo '{"configPath":${JSON.stringify(configPath)},"agentDir":${JSON.stringify(agentDirPath)},"auth":{"providers":[],"oauth":{"providers":[]}}}'
    fi
  elif [ "${minimaxCatalog ? "1" : "0"}" = "1" ]; then
    echo '{"configPath":${JSON.stringify(configPath)},"agentDir":${JSON.stringify(agentDirPath)},"defaultModel":"minimax/MiniMax-M2.5","resolvedDefault":"minimax/MiniMax-M2.5","fallbacks":["anthropic/claude-sonnet-4-6"],"auth":{"providers":[],"oauth":{"providers":[]}}}'
  else
    echo '{"configPath":${JSON.stringify(configPath)},"agentDir":${JSON.stringify(agentDirPath)},"defaultModel":"openai/gpt-5","resolvedDefault":"openai/gpt-5","fallbacks":["anthropic/claude-sonnet-4-6"],"auth":{"providers":[],"oauth":{"providers":[]}}}'
  fi
elif [ "$1" = "models" ] && [ "$2" = "--agent" ] && [ "$4" = "auth" ] && [ "$5" = "paste-token" ]; then
  mkdir -p /tmp/agent
  cat > /tmp/agent/auth-profiles.json <<'EOF'
{"version":1,"profiles":{"minimax:chillclaw-existing-agent":{"provider":"minimax","type":"api_key","label":"MiniMax API"}},"usageStats":{},"order":{"minimax":["minimax:chillclaw-existing-agent"]},"lastGood":{"minimax":"minimax:chillclaw-existing-agent"}}
EOF
  echo '{"ok":true}'
elif [ "$1" = "models" ] && [ "$2" = "auth" ] && [ "$3" = "login" ] && [ "$4" = "--provider" ] && [ "$5" = "openai-codex" ]; then
  cat > ${JSON.stringify(join(agentDirPath, "auth-profiles.json"))} <<'EOF'
{"version":1,"profiles":{"openai-codex:chillclaw":{"provider":"openai-codex","type":"oauth","label":"OpenAI Codex OAuth"}},"usageStats":{},"order":{"openai-codex":["openai-codex:chillclaw"]},"lastGood":{"openai-codex":"openai-codex:chillclaw"}}
EOF
  echo 'Open this URL to continue sign-in: https://auth.openai.example/authorize'
  sleep 0.1
elif [ "$1" = "channels" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  if [ "${canonicalWecomRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"chat":{"wecom":["default"]}}'
  elif [ "${legacyWechatRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"chat":{"wechat":["default"]}}'
  elif [ "${openclawWeixinRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"chat":{"openclaw-weixin":["default"]}}'
  else
    echo '{"chat":{"telegram":["default"]}}'
  fi
elif [ "$1" = "channels" ] && [ "$2" = "status" ] && [ "$3" = "--json" ] && [ "$4" = "--probe" ]; then
  if [ "${canonicalWecomRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"channels":{"wecom":{"configured":true,"running":true,"linked":true}},"channelAccounts":{"wecom":[{"accountId":"default","configured":true,"linked":true}]}}'
  elif [ "${legacyWechatRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"channels":{"wechat":{"configured":true,"running":true,"linked":true}},"channelAccounts":{"wechat":[{"accountId":"default","configured":true,"linked":true}]}}'
  elif [ "${openclawWeixinRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"channels":{"openclaw-weixin":{"configured":true,"running":true,"linked":true}},"channelAccounts":{"openclaw-weixin":[{"accountId":"default","configured":true,"linked":true}]}}'
  else
    echo '{"channels":{"telegram":{"configured":true,"running":true,"linked":true}},"channelAccounts":{"telegram":[{"accountId":"default","configured":true,"linked":true,"probe":{"bot":{"username":"support_bot"}}}]}}'
  fi
elif [ "$1" = "channels" ] && [ "$2" = "login" ] && [ "$3" = "--channel" ] && [ "$4" = "openclaw-weixin" ]; then
  echo "WEIXIN_LOGIN_HOME=$HOME" >> "$OPENCLAW_TEST_LOG"
  echo "WEIXIN_LOGIN_STATE_DIR=$OPENCLAW_STATE_DIR" >> "$OPENCLAW_TEST_LOG"
  echo 'Scan the QR code from WeChat on your phone to continue.'
  echo 'https://liteapp.weixin.qq.com/q/test-login?qrcode=test-token&bot_type=3'
  if [ -t 1 ]; then
    echo 'Interactive QR ready from TTY.'
  fi
  if [ "${longRunningWechatLogin ? "1" : "0"}" = "1" ]; then
    sleep 2
  fi
  exit 0
elif [ "$1" = "plugins" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  if [ -f "$OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER" ]; then
    plugin_status="ready"
    if [ -f "$OPENCLAW_TEST_PLUGIN_UPDATE_MARKER" ]; then
      plugin_status="update-available"
    fi
    plugin_enabled="false"
    if [ -f "$OPENCLAW_TEST_PLUGIN_ENABLED_MARKER" ]; then
      plugin_enabled="true"
    fi
    cat <<EOF
{"plugins":[{"id":"wecom-openclaw-plugin","name":"WeCom Plugin","source":"@wecom/wecom-openclaw-plugin","origin":"npm","enabled":${"$"}{plugin_enabled},"status":"${"$"}{plugin_status}"}],"diagnostics":[]}
EOF
  else
    echo '{"plugins":[],"diagnostics":[]}'
  fi
elif [ "$1" = "plugins" ] && [ "$2" = "install" ] && [ "$3" = "@wecom/wecom-openclaw-plugin" ]; then
  touch "$OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER"
  echo '{"status":"installed"}'
elif [ "$1" = "plugins" ] && [ "$2" = "install" ] && [ "$3" = "@tencent-weixin/openclaw-weixin@2.1.8" ]; then
  echo '{"status":"installed","pluginId":"openclaw-weixin"}'
elif [ "$1" = "plugins" ] && [ "$2" = "update" ] && [ "$3" = "wecom-openclaw-plugin" ] && [ "$4" = "--yes" ]; then
  rm -f "$OPENCLAW_TEST_PLUGIN_UPDATE_MARKER"
  echo 'Plugin updated'
elif [ "$1" = "plugins" ] && [ "$2" = "enable" ] && [ "$3" = "wecom-openclaw-plugin" ]; then
  touch "$OPENCLAW_TEST_PLUGIN_ENABLED_MARKER"
  echo 'Plugin enabled'
elif [ "$1" = "plugins" ] && [ "$2" = "enable" ] && [ "$3" = "openclaw-weixin" ]; then
  echo 'Plugin enabled'
elif [ "$1" = "plugins" ] && [ "$2" = "disable" ] && [ "$3" = "wecom-openclaw-plugin" ]; then
  rm -f "$OPENCLAW_TEST_PLUGIN_ENABLED_MARKER"
  echo 'Plugin disabled'
elif [ "$1" = "plugins" ] && [ "$2" = "uninstall" ] && [ "$3" = "wecom-openclaw-plugin" ]; then
  rm -f "$OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER" "$OPENCLAW_TEST_PLUGIN_ENABLED_MARKER" "$OPENCLAW_TEST_PLUGIN_UPDATE_MARKER"
  echo 'Plugin removed'
elif [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  touch ${JSON.stringify(gatewayServiceMarkerPath)}
  echo '{"status":"installed"}'
elif [ "$1" = "gateway" ] && [ "$2" = "start" ]; then
  if [ ! -f ${JSON.stringify(gatewayServiceMarkerPath)} ]; then
    >&2 echo 'Gateway service not installed.'
    exit 1
  fi
  touch ${JSON.stringify(gatewayRunningMarkerPath)}
  echo 'Gateway started'
elif [ "$1" = "gateway" ] && [ "$2" = "restart" ]; then
  if [ ! -f ${JSON.stringify(gatewayServiceMarkerPath)} ]; then
    echo 'Gateway service not loaded.'
    echo 'Start with: openclaw gateway install'
    echo 'Start with: openclaw gateway'
    exit 0
  fi
  touch ${JSON.stringify(gatewayRunningMarkerPath)}
  if [ "${failGatewayRestartWithPluginsAllowWarning ? "1" : "0"}" = "1" ]; then
    >&2 echo '[plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load: openclaw-weixin (/Users/home/.openclaw/extensions/openclaw-weixin/index.ts). Set plugins.allow to explicit trusted ids.'
    exit 1
  fi
  echo 'Gateway restarted'
elif [ "$1" = "channels" ] && [ "$2" = "add" ] && [ "$3" = "--channel" ] && [ "$4" = "telegram" ] && [ "${failTelegramChannelsAdd ? "1" : "0"}" = "1" ]; then
  >&2 echo 'Unknown channel: telegram'
  exit 1
elif [ "$1" = "config" ] && [ "$2" = "set" ] && [ "$3" = "--strict-json" ] && [ "$4" = "channels.feishu" ] && [ "${failFeishuConfigSet ? "1" : "0"}" = "1" ]; then
  >&2 echo 'unknown option --strict-json'
  exit 1
elif [ "$1" = "config" ] && [ "$2" = "set" ] && [ "$3" = "--strict-json" ] && [ "$4" = "channels.wecom-openclaw-plugin" ] && [ "${failWechatConfigSet ? "1" : "0"}" = "1" ]; then
  >&2 echo 'unknown option --strict-json'
  exit 1
elif [ "$1" = "channels" ] && [ "$2" = "remove" ] && [ "$3" = "--channel" ] && [ "$4" = "openclaw-weixin" ] && [ "$5" = "--account" ] && [ "$6" = "default" ] && [ "$7" = "--delete" ] && [ "${failPersonalWechatDelete ? "1" : "0"}" = "1" ]; then
  >&2 echo '[plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load: openclaw-weixin (/Users/home/.openclaw/extensions/openclaw-weixin/index.ts). Set plugins.allow to explicit trusted ids.'
  >&2 echo 'Channel openclaw-weixin does not support delete.'
  exit 1
elif [ "$1" = "skills" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  echo '{"workspaceDir":"/tmp/skills","managedSkillsDir":"/tmp/skills","skills":[]}'
elif [ "$1" = "skills" ] && [ "$2" = "check" ]; then
  echo '- All good'
elif [ "$1" = "agents" ] && [ "$2" = "list" ] && [ "$3" = "--json" ] && [ "$4" = "--bindings" ]; then
  if [ "${agentsListJsonOnStderr ? "1" : "0"}" = "1" ]; then
    >&2 echo '[plugins] feishu_doc: Registered feishu_doc, feishu_app_scopes'
    >&2 echo '[{"id":"main","identityName":"Maggie","bindings":0},{"id":"chillclaw-model-openai","identityName":"OpenAI Helper","bindings":0},{"id":"stderr-agent","identityName":"Stderr Agent","identityEmoji":"🦊","workspace":"/tmp/stderr-workspace","agentDir":"/tmp/stderr-agent","model":"openai/gpt-5","bindings":1}]'
    >&2 echo '[plugins] feishu_chat: Registered feishu_chat tool'
  elif [ "${staleManagedMemberAgent ? "1" : "0"}" = "1" ]; then
    echo '[plugins] feishu_doc: Registered feishu_doc, feishu_app_scopes'
    echo '[{"id":"main","identityName":"Maggie","bindings":0},{"id":"chillclaw-member-helper-20260327-000000","identityName":"Helper","identityEmoji":"🧠","workspace":${JSON.stringify(join(dataDir, "ai-members", "member-1", "workspace"))},"agentDir":${JSON.stringify(join(dataDir, "ai-members", "member-1", "agent"))},"model":"openai/gpt-5","bindings":1},{"id":"existing-agent","identityName":"Existing Agent","identityEmoji":"🧭","workspace":"/tmp/workspace","agentDir":"/tmp/agent","model":"openai/gpt-5","bindings":2}]'
    echo '[plugins] feishu_chat: Registered feishu_chat tool'
  else
    echo '[plugins] feishu_doc: Registered feishu_doc, feishu_app_scopes'
    echo '[{"id":"main","identityName":"Maggie","bindings":0},{"id":"chillclaw-model-openai","identityName":"OpenAI Helper","bindings":0},{"id":"existing-agent","identityName":"Existing Agent","identityEmoji":"🧭","workspace":"/tmp/workspace","agentDir":"/tmp/agent","model":"openai/gpt-5","bindings":2}]'
    echo '[plugins] feishu_chat: Registered feishu_chat tool'
  fi
elif [ "$1" = "agents" ] && [ "$2" = "bind" ] && [ "$3" = "--agent" ] && [ "$5" = "--bind" ]; then
  if [ "${failPersonalWechatBindingAlias ? "1" : "0"}" = "1" ] && [ "$6" = "wechat:default" ]; then
    >&2 echo 'Unknown channel "wechat".'
    exit 1
  fi
  if [ "${bindConflictWithStaleOwner ? "1" : "0"}" = "1" ] && [ "$4" != "chillclaw-member-smart-ryo-20260412-122127" ] && grep -Fq "chillclaw-member-smart-ryo-20260412-122127" ${JSON.stringify(configPath)}; then
    >&2 echo '[agents/auth-profiles] synced openai-codex credentials from external cli'
    >&2 echo '[plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load: openclaw-weixin (/Users/home/.openclaw/extensions/openclaw-weixin/index.ts). Set plugins.allow to explicit trusted ids.'
    echo '{"agentId":"'"$4"'","added":[],"updated":[],"skipped":[],"conflicts":["openclaw-weixin accountId=default (agent=chillclaw-member-smart-ryo-20260412-122127)"]}'
    exit 1
  fi
  touch ${JSON.stringify(bindingsPath)}
  if ! grep -Fqx "$4|$6" ${JSON.stringify(bindingsPath)}; then
    echo "$4|$6" >> ${JSON.stringify(bindingsPath)}
  fi
  echo '{"ok":true}'
elif [ "$1" = "agents" ] && [ "$2" = "unbind" ] && [ "$3" = "--agent" ] && [ "$5" = "--bind" ]; then
  if [ "${bindConflictWithStaleOwner ? "1" : "0"}" = "1" ] && [ "$4" = "chillclaw-member-smart-ryo-20260412-122127" ]; then
    >&2 echo 'Agent "chillclaw-member-smart-ryo-20260412-122127" not found.'
    exit 1
  fi
  if [ -f ${JSON.stringify(bindingsPath)} ]; then
    grep -Fvx "$4|$6" ${JSON.stringify(bindingsPath)} > ${JSON.stringify(bindingsPath)}.next || true
    mv ${JSON.stringify(bindingsPath)}.next ${JSON.stringify(bindingsPath)}
  fi
  echo '{"ok":true}'
elif [ "$1" = "agents" ] && [ "$2" = "bindings" ]; then
  if [ -f ${JSON.stringify(bindingsPath)} ] && grep -q "^$4|" ${JSON.stringify(bindingsPath)}; then
    first=1
    printf '['
    while IFS='|' read -r bound_agent bound_target; do
      [ "$bound_agent" = "$4" ] || continue
      if [ "$first" -eq 0 ]; then
        printf ','
      fi
      if [ "${bindingsUseMatchShape ? "1" : "0"}" = "1" ]; then
        case "$bound_target" in
          *:*)
            bound_channel="${"$"}{bound_target%%:*}"
            bound_account="${"$"}{bound_target#*:}"
            printf '{"agentId":"%s","match":{"channel":"%s","accountId":"%s"},"description":"%s accountId=%s"}' "$bound_agent" "$bound_channel" "$bound_account" "$bound_channel" "$bound_account"
            ;;
          *)
            printf '{"id":"%s","target":"%s"}' "$bound_target" "$bound_target"
            ;;
        esac
      else
        printf '{"id":"%s","target":"%s"}' "$bound_target" "$bound_target"
      fi
      first=0
    done < ${JSON.stringify(bindingsPath)}
    printf ']\n'
  else
    echo '[{"id":"telegram:default","target":"telegram:default"}]'
  fi
elif [ "$1" = "gateway" ] && [ "$2" = "call" ] && [ "$3" = "chat.send" ] && [ "$4" = "--json" ]; then
  echo '{"runId":"run-123"}'
elif [ "$1" = "gateway" ] && [ "$2" = "call" ] && [ "$3" = "chat.history" ] && [ "$4" = "--json" ]; then
  echo '${chatHistoryPayload.replace(/'/g, "'\\''")}'
else
  echo '{}'
fi
`
  );
  await chmod(binaryPath, 0o755);

  process.env.PATH = originalPath ? `${binDir}:${originalPath}` : binDir;
  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.OPENCLAW_TEST_LOG = logPath;
  process.env.OPENCLAW_TEST_VERSION_FILE = versionPath;
  process.env.OPENCLAW_TEST_UPDATE_MARKER = updateMarkerPath;
  process.env.OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER = pluginInstalledMarkerPath;
  process.env.OPENCLAW_TEST_PLUGIN_ENABLED_MARKER = pluginEnabledMarkerPath;
  process.env.OPENCLAW_TEST_PLUGIN_UPDATE_MARKER = pluginUpdateMarkerPath;

  const adapter = new OpenClawAdapter();
  adapter.invalidateReadCaches();

  try {
    await fn({ adapter, logPath, configPath, dataDir });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, options?.longRunningWechatLogin ? 2200 : 150));
    adapter.invalidateReadCaches();
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalLogPath === undefined) {
      delete process.env.OPENCLAW_TEST_LOG;
    } else {
      process.env.OPENCLAW_TEST_LOG = originalLogPath;
    }
    if (originalVersionPath === undefined) {
      delete process.env.OPENCLAW_TEST_VERSION_FILE;
    } else {
      process.env.OPENCLAW_TEST_VERSION_FILE = originalVersionPath;
    }
    if (originalUpdateMarkerPath === undefined) {
      delete process.env.OPENCLAW_TEST_UPDATE_MARKER;
    } else {
      process.env.OPENCLAW_TEST_UPDATE_MARKER = originalUpdateMarkerPath;
    }
    if (originalPluginInstalledMarkerPath === undefined) {
      delete process.env.OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER;
    } else {
      process.env.OPENCLAW_TEST_PLUGIN_INSTALLED_MARKER = originalPluginInstalledMarkerPath;
    }
    if (originalPluginEnabledMarkerPath === undefined) {
      delete process.env.OPENCLAW_TEST_PLUGIN_ENABLED_MARKER;
    } else {
      process.env.OPENCLAW_TEST_PLUGIN_ENABLED_MARKER = originalPluginEnabledMarkerPath;
    }
    if (originalPluginUpdateMarkerPath === undefined) {
      delete process.env.OPENCLAW_TEST_PLUGIN_UPDATE_MARKER;
    } else {
      process.env.OPENCLAW_TEST_PLUGIN_UPDATE_MARKER = originalPluginUpdateMarkerPath;
    }
    await rm(tempDir, { recursive: true, force: true });
    releaseLock();
  }
}

async function readCommands(logPath: string): Promise<string[]> {
  const raw = await readFile(logPath, "utf8").catch(() => "");
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function countCommands(commands: string[], needle: string): number {
  return commands.filter((command) => command === needle).length;
}

async function waitForTestValue<T>(
  read: () => Promise<T>,
  isReady: (value: T) => boolean,
  describeLastValue: (value: T | undefined) => string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
  }
): Promise<T> {
  const intervalMs = options?.intervalMs ?? 100;
  const timeoutMs = options?.timeoutMs ?? (process.env.CI === "true" ? 10_000 : 5_000);
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  do {
    lastValue = await read();
    if (isReady(lastValue)) {
      return lastValue;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);

  assert.fail(describeLastValue(lastValue));
}

test("OpenClaw model config uses the full provider catalog and one status read per refresh cycle", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const config = await adapter.config.getModelConfig();
    const commands = await readCommands(logPath);
    const openai = config.providers.find((provider) => provider.id === "openai");
    const cloudflare = config.providers.find((provider) => provider.id === "cloudflare-ai-gateway");
    const ollama = config.providers.find((provider) => provider.id === "ollama");

    assert.equal(countCommands(commands, "models list --json"), 1);
    assert.equal(countCommands(commands, "models status --json"), 1);
    assert.equal(countCommands(commands, "models list --all --json"), 1);
    assert.deepEqual(config.models.map((model) => model.key), [
      "openai/gpt-5",
      "anthropic/claude-sonnet-4-6",
      "google/gemini-2.5-pro"
    ]);
    assert.equal(openai?.providerType, "built-in");
    assert.equal(openai?.authEnvVars?.includes("OPENAI_API_KEY"), true);
    assert.equal(openai?.exampleModels?.some((model) => model.startsWith("openai/")), true);
    assert.equal(cloudflare?.providerType, "gateway");
    assert.equal(ollama?.providerType, "local");
    assert.equal(ollama?.supportsNoAuth, true);
  });
});

test("fresh model invalidation reuses an in-flight model snapshot instead of starting a duplicate reload", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const firstRead = adapter.config.getModelConfig();
    await waitForTestValue(
      () => readCommands(logPath),
      (commands) =>
        countCommands(commands, "models list --json") >= 1 &&
        countCommands(commands, "models list --all --json") >= 1 &&
        countCommands(commands, "models status --json") >= 1,
      (commands) => `Timed out waiting for in-flight model commands:\n${commands?.join("\n") ?? "(none)"}`,
      { intervalMs: 50 }
    );
    adapter.invalidateReadCaches(["models"]);

    await Promise.all([firstRead, adapter.config.getModelConfig()]);

    const commands = await readCommands(logPath);

    assert.equal(countCommands(commands, "models list --json"), 1);
    assert.equal(countCommands(commands, "models status --json"), 1);
    assert.equal(countCommands(commands, "models list --all --json"), 1);
  }, {
    slowModelReads: true
  });
});

test("slow model snapshots stay cached after they finish loading", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.config.getModelConfig();
    await adapter.config.getModelConfig();

    const commands = await readCommands(logPath);

    assert.equal(countCommands(commands, "models list --json"), 1);
    assert.equal(countCommands(commands, "models status --json"), 1);
    assert.equal(countCommands(commands, "models list --all --json"), 1);
  }, {
    slowModelReads: true
  });
});

test("OpenClaw model config clears stale configured models when the live runtime is clean", async () => {
  await withFakeOpenClaw(async ({ adapter, dataDir }) => {
    const statePath = resolve(dataDir, "openclaw-state.json");
    const previousState = await readFile(statePath, "utf8").catch(() => undefined);

    try {
      await writeFile(
        statePath,
        JSON.stringify({
          modelEntries: [
            {
              id: "stale-openai",
              label: "OpenAI GPT-5",
              providerId: "openai",
              modelKey: "openai/gpt-5",
              agentId: "main",
              agentDir: "/tmp/main",
              workspaceDir: "/tmp/workspace",
              isDefault: true,
              isFallback: false,
              createdAt: "2026-03-15T00:00:00.000Z",
              updatedAt: "2026-03-15T00:00:00.000Z"
            }
          ],
          defaultModelEntryId: "stale-openai",
          fallbackModelEntryIds: []
        }, null, 2)
      );

      adapter.invalidateReadCaches();

      const config = await adapter.config.getModelConfig();
      const persistedState = JSON.parse(await readFile(statePath, "utf8")) as {
        modelEntries?: Array<{ id: string }>;
        defaultModelEntryId?: string;
      };

      assert.equal(config.models.length, 0);
      assert.equal(config.savedEntries.length, 0);
      assert.equal(config.defaultModel, undefined);
      assert.deepEqual(persistedState.modelEntries, []);
      assert.equal(persistedState.defaultModelEntryId, undefined);
    } finally {
      if (previousState === undefined) {
        await rm(statePath, { force: true });
      } else {
        await writeFile(statePath, previousState);
      }
    }
  }, {
    cleanModelRuntime: true
  });
});

test("creating a normal OAuth saved model entry authenticates through models auth login without creating a hidden agent", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const created = await adapter.config.createSavedModelEntry({
      label: "OpenAI Codex",
      providerId: "openai",
      methodId: "openai-codex",
      modelKey: "openai-codex/gpt-5.4",
      values: {},
      makeDefault: false,
      useAsFallback: false
    });

    assert.equal(created.status, "interactive");
    assert.ok(created.authSession?.id);

    adapter.invalidateReadCaches(["models"]);
    const staleAuthSessionRead = adapter.config.getModelAuthSession(created.authSession.id);
    await waitForTestValue(
      () => readCommands(logPath),
      (commands) =>
        countCommands(commands, "models list --json") >= 2 &&
        countCommands(commands, "models list --all --json") >= 2 &&
        countCommands(commands, "models status --json") >= 2,
      (commands) => `Timed out waiting for overlapping model reads:\n${commands?.join("\n") ?? "(none)"}`,
      { intervalMs: 25 }
    );

    const session = await waitForTestValue(
      () => adapter.config.getModelAuthSession(created.authSession!.id),
      (authSession) => authSession.session.status !== "running",
      (authSession) => `Timed out waiting for model auth session to complete:\n${JSON.stringify(authSession?.session ?? null, null, 2)}`,
      { intervalMs: 150 }
    );
    await staleAuthSessionRead;
    const commands = await readCommands(logPath);

    assert.equal(session.session.status, "completed");
    assert.match(session.session.message, /apply.*gateway|saved/i);
    assert.ok(session.modelConfig.savedEntries.some((entry) => entry.label === "OpenAI Codex"));
    assert.equal(
      commands.some((command) => command.startsWith("agents add chillclaw-model-") || command.startsWith("agents set-identity --agent chillclaw-model-")),
      false
    );
    assert.equal(countCommands(commands, "models auth login --provider openai-codex"), 1);
    assert.equal(countCommands(commands, "gateway restart"), 0);

    const status = await waitForTestValue(
      () => adapter.status(),
      (engineStatus) => engineStatus.pendingGatewayApply === true,
      (engineStatus) => `Timed out waiting for pending gateway apply after OAuth auth:\n${JSON.stringify(engineStatus ?? null, null, 2)}`,
      { intervalMs: 50 }
    );
    assert.equal(status.pendingGatewayApply, true);
  }, {
    slowModelReads: true
  });
});

test("updating a token-auth runtime model without reusable credentials requires entering the token again", async () => {
  await withFakeOpenClaw(async ({ adapter, dataDir }) => {
    const statePath = resolve(dataDir, "openclaw-state.json");
    await writeFile(
      statePath,
      JSON.stringify(
        {
          modelEntries: [
            {
              id: "entry-minimax",
              label: "MiniMax",
              providerId: "minimax",
              modelKey: "minimax/MiniMax-M2.7",
              agentId: "",
              agentDir: "",
              workspaceDir: "",
              authMethodId: "minimax-api",
              profileIds: [],
              isDefault: true,
              isFallback: false,
              createdAt: "2026-03-30T00:00:00.000Z",
              updatedAt: "2026-03-30T00:00:00.000Z"
            }
          ],
          defaultModelEntryId: "entry-minimax",
          fallbackModelEntryIds: []
        },
        null,
        2
      )
    );

    await assert.rejects(
      () =>
        adapter.config.updateSavedModelEntry("entry-minimax", {
          label: "MiniMax",
          providerId: "minimax",
          methodId: "minimax-api",
          modelKey: "minimax/MiniMax-M2.7",
          values: {},
          makeDefault: true,
          useAsFallback: false
        }),
      /Enter the API Key first\./i
    );
  }, {
    minimaxCatalog: true
  });
});

test("OpenClaw channel reads reuse one list and one probe across channel state and configured entry loads", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await Promise.all([
      adapter.getChannelState("telegram"),
      adapter.getChannelState("whatsapp"),
      adapter.getChannelState("feishu"),
      adapter.getChannelState("wechat"),
      adapter.getConfiguredChannelEntries()
    ]);
    const commands = await readCommands(logPath);

    assert.equal(countCommands(commands, "channels list --json"), 1);
    assert.equal(countCommands(commands, "channels status --json --probe"), 1);
  });
});

test("legacy runtime wechat channel state is normalized to wechat-work", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const entries = await adapter.getConfiguredChannelEntries();
    const legacyEntry = entries.find((entry) => entry.id === "wechat-work:default");
    const wechatWorkState = await adapter.getChannelState("wechat-work");
    const personalWechatState = await adapter.getChannelState("wechat");

    assert.ok(legacyEntry);
    assert.equal(legacyEntry.channelId, "wechat-work");
    assert.equal(entries.some((entry) => entry.channelId === "wechat"), false);
    assert.equal(wechatWorkState.status, "completed");
    assert.equal(personalWechatState.status, "not-started");
  }, {
    legacyWechatRuntime: true
  });
});

test("canonical runtime wecom channel state is normalized to wechat-work", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const entries = await adapter.getConfiguredChannelEntries();
    const wecomEntry = entries.find((entry) => entry.id === "wechat-work:default");
    const wechatWorkState = await adapter.getChannelState("wechat-work");

    assert.ok(wecomEntry);
    assert.equal(wecomEntry?.channelId, "wechat-work");
    assert.equal(wechatWorkState.status, "completed");
  }, {
    canonicalWecomRuntime: true
  });
});

test("personal WeChat runtime is normalized from openclaw-weixin", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const entries = await adapter.getConfiguredChannelEntries();
    const personalWechatEntry = entries.find((entry) => entry.id === "wechat:default");
    const personalWechatState = await adapter.getChannelState("wechat");
    const wechatWorkState = await adapter.getChannelState("wechat-work");

    assert.ok(personalWechatEntry);
    assert.equal(personalWechatEntry?.channelId, "wechat");
    assert.equal(entries.some((entry) => entry.channelId === "wechat-work"), false);
    assert.equal(personalWechatState.status, "awaiting-pairing");
    assert.equal(personalWechatEntry?.pairingRequired, true);
    assert.equal(wechatWorkState.status, "not-started");
  }, {
    openclawWeixinRuntime: true
  });
});

test("configureTelegram falls back to direct config writes when the command path rejects telegram", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "telegram",
      action: "save",
      values: {
        token: "123:fake-token",
        accountName: "Fallback Bot"
      }
    });
    const commands = await readCommands(logPath);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: { telegram?: Record<string, unknown> };
    };

    assert.match(result.message, /saved|apply/i);
    assert.equal(result.requiresGatewayApply, true);
    assert.equal(countCommands(commands, "channels add --channel telegram --token 123:fake-token --name Fallback Bot"), 1);
    assert.equal(countCommands(commands, "gateway restart"), 0);
    assert.equal(config.channels?.telegram?.enabled, true);
    assert.equal(config.channels?.telegram?.botToken, "123:fake-token");
    assert.equal(config.channels?.telegram?.dmPolicy, "pairing");

    const status = await adapter.status();
    assert.equal(status.pendingGatewayApply, true);
  }, {
    failTelegramChannelsAdd: true
  });
});

test("saveCustomSkill stages the skill change without restarting the gateway", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.config.saveCustomSkill(undefined, {
      name: "Summarizer",
      description: "Summarize content",
      instructions: "Summarize user content clearly."
    });
    const commands = await readCommands(logPath);

    assert.equal(result.requiresGatewayApply, true);
    assert.equal(result.slug, "summarizer");
    assert.equal(countCommands(commands, "gateway restart"), 0);

    const status = await adapter.status();
    assert.equal(status.pendingGatewayApply, true);
  });
});

test("saveAIMemberRuntime stages agent changes without restarting the gateway", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const modelConfig = await adapter.config.getModelConfig();
    const brainEntry = modelConfig.savedEntries[0];
    const result = await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-1",
      existingAgentId: "existing-agent",
      name: "AI Assistant",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🦊",
        theme: "sunrise"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: brainEntry.id,
        label: brainEntry.label,
        providerId: brainEntry.providerId,
        modelKey: brainEntry.modelKey
      }
    });
    const commands = await readCommands(logPath);

    assert.equal(result.agentId, "existing-agent");
    assert.equal(result.requiresGatewayApply, true);
    assert.equal(countCommands(commands, "gateway restart"), 0);

    const status = await adapter.status();
    assert.equal(status.pendingGatewayApply, true);
  });
});

test("saveAIMemberRuntime promotes the member agent to explicit default ownership and prunes main", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath }) => {
    await writeFile(configPath, JSON.stringify({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5",
            fallbacks: []
          },
          models: {
            "openai/gpt-5": {}
          },
          workspace: "/tmp/main-workspace"
        },
        list: [
          {
            id: "main",
            name: "Main",
            agentDir: "/tmp/main-agent",
            workspace: "/tmp/main-workspace",
            model: "openai/gpt-5",
            default: true
          }
        ]
      }
    }, null, 2));

    const modelConfig = await adapter.config.getModelConfig();
    const brainEntry = modelConfig.savedEntries[0];
    await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-1",
      existingAgentId: "existing-agent",
      name: "AI Assistant",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🦊",
        theme: "sunrise"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: brainEntry.id,
        label: brainEntry.label,
        providerId: brainEntry.providerId,
        modelKey: brainEntry.modelKey
      }
    });

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: {
        list?: Array<{ id: string; default?: boolean }>;
      };
    };

    assert.equal(config.agents?.list?.some((entry) => entry.id === "main"), false);
    assert.equal(config.agents?.list?.find((entry) => entry.id === "existing-agent")?.default, true);
    assert.equal(config.agents?.list?.filter((entry) => entry.default).length, 1);
  });
});

test("bindAIMemberChannel maps personal WeChat bindings to the runtime channel id", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.aiEmployees.bindAIMemberChannel("existing-agent", {
      binding: "wechat:default"
    });
    const commands = await readCommands(logPath);

    assert.equal(result.requiresGatewayApply, true);
    assert.equal(result.bindings.some((entry) => entry.target === "wechat:default"), true);
    assert.equal(countCommands(commands, "agents bind --agent existing-agent --bind openclaw-weixin:default --json"), 1);
    assert.equal(countCommands(commands, "agents bind --agent existing-agent --bind wechat:default --json"), 0);
  }, {
    failPersonalWechatBindingAlias: true,
    bindingsUseMatchShape: true
  });
});

test("bindAIMemberChannel clears stale conflict owners reported by OpenClaw bind output", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.aiEmployees.bindAIMemberChannel("existing-agent", {
      binding: "wechat:default"
    });
    const commands = await readCommands(logPath);

    assert.equal(result.requiresGatewayApply, true);
    assert.deepEqual(result.bindings, [{ id: "wechat:default", target: "wechat:default" }]);
    assert.equal(
      countCommands(
        commands,
        "agents unbind --agent chillclaw-member-smart-ryo-20260412-122127 --bind openclaw-weixin:default --json"
      ),
      1
    );
    assert.equal(countCommands(commands, "agents bind --agent existing-agent --bind openclaw-weixin:default --json"), 2);
  }, {
    bindConflictWithStaleOwner: true,
    bindingsUseMatchShape: true
  });
});

test("restartGateway clears the pending apply flag after staged changes", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    await adapter.config.saveChannelEntry({
      channelId: "telegram",
      action: "save",
      values: {
        token: "123:fake-token",
        accountName: "Apply Bot"
      }
    });

    const before = await adapter.status();
    assert.equal(before.pendingGatewayApply, true);

    const result = await adapter.gateway.restartGateway();

    assert.equal(result.status, "completed");
    assert.equal(result.engineStatus.pendingGatewayApply, false);

    const after = await adapter.status();
    assert.equal(after.pendingGatewayApply, false);
  });
});

test("configureFeishu falls back to direct config writes when config set drifts", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "feishu",
      action: "save",
      values: {
        appId: "cli-app-id",
        appSecret: "cli-app-secret",
        domain: "feishu",
        botName: "ChillClaw Feishu"
      }
    });
    const commands = await readCommands(logPath);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: { feishu?: Record<string, unknown> };
    };

    assert.equal(result.requiresGatewayApply, true);
    assert.match(result.message, /apply pending/i);
    assert.equal(countCommands(commands, "gateway restart"), 0);
    assert.equal(config.channels?.feishu?.enabled, true);
    assert.equal(config.channels?.feishu?.domain, "feishu");
  }, {
    failFeishuConfigSet: true
  });
});

test("configureWechatWorkaround writes the documented channels.wecom config shape", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat-work",
      action: "save",
      values: {
        botId: "bot-id",
        secret: "corp-secret"
      }
    });
    const commands = await readCommands(logPath);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: Record<string, Record<string, unknown>>;
    };
    const saved = config.channels?.wecom;

    assert.equal(result.requiresGatewayApply, true);
    assert.equal(result.channel.status, "awaiting-pairing");
    assert.match(result.message, /pairing code/i);
    assert.equal(countCommands(commands, "gateway restart"), 0);
    assert.equal(saved?.enabled, true);
    assert.equal(saved?.botId, "bot-id");
    assert.equal(saved?.secret, "corp-secret");
    assert.equal("corpId" in (saved ?? {}), false);
    assert.equal("webhookPath" in (saved ?? {}), false);
    assert.equal("token" in (saved ?? {}), false);
    assert.equal("encodingAESKey" in (saved ?? {}), false);
  });
});

test("approvePairing uses the canonical wecom channel id for wechat-work", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat-work",
      action: "approve-pairing",
      values: {
        code: "RRR7T5CT"
      }
    });
    const commands = await readCommands(logPath);

    assert.equal(result.channel.status, "completed");
    assert.equal(countCommands(commands, "pairing approve wecom RRR7T5CT --notify"), 1);
  });
});

test("configureWechatWorkaround removes the legacy channels.wecom-openclaw-plugin key and avoids strict config set", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    await writeFile(configPath, JSON.stringify({
      channels: {
        "wecom-openclaw-plugin": {
          enabled: true,
          botId: "legacy-bot",
          secret: "legacy-secret",
          token: "legacy-token"
        }
      }
    }));

    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat-work",
      action: "save",
      values: {
        botId: "bot-id",
        secret: "corp-secret"
      }
    });
    const commands = await readCommands(logPath);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: Record<string, Record<string, unknown>>;
    };
    const saved = config.channels?.wecom;

    assert.equal(result.requiresGatewayApply, true);
    assert.match(result.message, /apply pending/i);
    assert.equal(countCommands(commands, "config set --strict-json channels.wecom"), 0);
    assert.equal(saved?.enabled, true);
    assert.equal(saved?.botId, "bot-id");
    assert.equal(saved?.secret, "corp-secret");
    assert.equal("wecom-openclaw-plugin" in (config.channels ?? {}), false);
  });
});

test("personal WeChat installs the pinned plugin and starts a channel session log flow", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "save",
      values: {}
    });
    assert.ok(result.session);
    const session = await waitForTestValue(
      () => adapter.gateway.getChannelSession(result.session!.id),
      (channelSession) =>
        channelSession.logs.some((line) => /qr code|scan/i.test(line)) &&
        channelSession.logs.some((line) => line.includes("openclaw plugins install") && line.includes("@tencent-weixin/openclaw-weixin@2.1.8")) &&
        channelSession.logs.some((line) => /channels login --channel openclaw-weixin/.test(line)),
      (channelSession) => `Timed out waiting for personal WeChat login logs:\n${channelSession?.logs.join("\n") ?? "(none)"}`
    );

    const commands = await waitForTestValue(
      () => readCommands(logPath),
      (loggedCommands) =>
        loggedCommands.some((command) => command === "plugins install @tencent-weixin/openclaw-weixin@2.1.8 --force") &&
        loggedCommands.some((command) => command === "plugins enable openclaw-weixin") &&
        loggedCommands.some((command) => command === "channels login --channel openclaw-weixin"),
      (loggedCommands) => `Timed out waiting for personal WeChat login commands:\n${loggedCommands?.join("\n") ?? "(none)"}`
    );

    assert.equal(session.channelId, "wechat");
    assert.match(session.message ?? "", /wechat login|qr/i);
    assert.equal(session.launchUrl, "https://liteapp.weixin.qq.com/q/test-login?qrcode=test-token&bot_type=3");
    assert.equal(session.logs.some((line) => /qr code|scan/i.test(line)), true);
    assert.equal(session.logs.some((line) => line.includes("openclaw plugins install") && line.includes("@tencent-weixin/openclaw-weixin@2.1.8")), true);
    assert.equal(session.logs.some((line) => /channels login --channel openclaw-weixin/.test(line)), true);
    assert.equal(
      commands.some((command) => command === "plugins install @tencent-weixin/openclaw-weixin@2.1.8 --force"),
      true
    );
    assert.equal(commands.some((command) => command === "plugins enable openclaw-weixin"), true);
    assert.equal(commands.some((command) => command === "channels login --channel openclaw-weixin"), true);
  });
});

test("personal WeChat login uses ChillClaw's managed OpenClaw home", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, dataDir }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "save",
      values: {}
    });
    assert.ok(result.session);

    const commands = await waitForTestValue(
      () => readCommands(logPath),
      (loggedCommands) => loggedCommands.some((command) => command === "channels login --channel openclaw-weixin"),
      (loggedCommands) => `Timed out waiting for personal WeChat login command:\n${loggedCommands?.join("\n") ?? "(none)"}`
    );
    const managedHome = join(dataDir, "openclaw-home");

    assert.equal(commands.includes(`WEIXIN_LOGIN_HOME=${managedHome}`), true, commands.join("\n"));
    assert.equal(commands.includes(`WEIXIN_LOGIN_STATE_DIR=${join(managedHome, ".openclaw")}`), true, commands.join("\n"));
  });
});

test("personal WeChat captures login output that only appears on an interactive TTY", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "save",
      values: {}
    });
    assert.ok(result.session);
    const session = await waitForTestValue(
      () => adapter.gateway.getChannelSession(result.session!.id),
      (channelSession) => channelSession.logs.some((line) => /interactive qr ready from tty/i.test(line)),
      (channelSession) => `Timed out waiting for interactive TTY WeChat login output:\n${channelSession?.logs.join("\n") ?? "(none)"}`
    );

    assert.equal(
      session.logs.some((line) => /interactive qr ready from tty/i.test(line)),
      true,
      session.logs.join("\n")
    );
  });
});

test("personal WeChat hides completed login sessions from general config while onboarding can still fetch them", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "save",
      values: {}
    });
    assert.ok(result.session);

    const session = await waitForTestValue(
      () => adapter.gateway.getChannelSession(result.session!.id),
      (channelSession) => channelSession.status === "completed",
      (channelSession) => `Timed out waiting for personal WeChat login completion:\n${channelSession?.logs.join("\n") ?? "(none)"}`
    );

    assert.equal(session.status, "completed", session.logs.join("\n"));
    assert.match(session.message, /gateway activation after onboarding/i);

    const activeSession = await adapter.gateway.getActiveChannelSession();
    const liveState = await adapter.getChannelState("wechat");

    assert.equal(activeSession, undefined);
    assert.equal(liveState.status, "awaiting-pairing");
  }, {
    openclawWeixinRuntime: true
  });
});

test("personal WeChat approves pairing through the runtime plugin channel id", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "approve-pairing",
      values: {
        code: " WX-PAIR-123 "
      }
    });
    const commands = await readCommands(logPath);

    assert.equal(result.channel.status, "completed");
    assert.equal(
      commands.some((command) => command === "pairing approve openclaw-weixin  WX-PAIR-123  --notify"),
      false
    );
    assert.equal(
      commands.some((command) => command === "pairing approve openclaw-weixin WX-PAIR-123 --notify"),
      true
    );
  });
});

test("personal WeChat does not start a second login while the QR session is still active", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const firstPromise = adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "save",
      values: {}
    });
    const firstSession = await waitForTestValue(
      () => adapter.gateway.getActiveChannelSession(),
      (channelSession) => channelSession?.channelId === "wechat" && channelSession.status === "running",
      (channelSession) => `Timed out waiting for active personal WeChat login session:\n${JSON.stringify(channelSession ?? null, null, 2)}`
    );

    const second = await adapter.config.saveChannelEntry({
      channelId: "wechat",
      action: "save",
      values: {}
    });
    const first = await firstPromise;

    assert.ok(first.session);
    assert.equal(firstSession?.channelId, "wechat");
    assert.equal(firstSession?.status, "running");
    assert.equal(second.message, "WeChat login is already running.");
    assert.equal(second.session?.id, first.session?.id);
  }, {
    longRunningWechatLogin: true
  });
});

test("personal WeChat removal falls back to config cleanup when runtime delete is unsupported", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    await writeFile(configPath, JSON.stringify({
      channels: {
        "openclaw-weixin": {
          enabled: true
        }
      }
    }));

    const result = await adapter.config.removeChannelEntry({
      entryId: "wechat:default",
      channelId: "wechat"
    });
    const commands = await readCommands(logPath);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: Record<string, unknown>;
    };

    assert.equal(result.channelId, "wechat");
    assert.equal(result.requiresGatewayApply, true);
    assert.match(result.message, /wechat configuration removed/i);
    assert.equal(countCommands(commands, "channels remove --channel openclaw-weixin --account default --delete"), 1);
    assert.equal("openclaw-weixin" in (config.channels ?? {}), false);
  }, {
    failPersonalWechatDelete: true
  });
});

test("saveAIMemberRuntime prefers the canonical saved model key over stale client casing", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath }) => {
    const modelConfig = await adapter.config.getModelConfig();
    const brainEntry = modelConfig.savedEntries[0];
    const result = await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-2",
      existingAgentId: "existing-agent",
      name: "Canonical Brain",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🦊",
        theme: "sunrise"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: brainEntry.id,
        label: brainEntry.label,
        providerId: brainEntry.providerId,
        modelKey: "openai/GPT-5"
      }
    });
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: {
        list?: Array<{
          id?: string;
          model?: string | { primary?: string; fallbacks?: string[] };
        }>;
      };
    };
    const savedAgent = config.agents?.list?.find((entry) => entry.id === "existing-agent");

    assert.equal(result.requiresGatewayApply, true);
    assert.deepEqual(savedAgent?.model, {
      primary: "openai/gpt-5",
      fallbacks: []
    });
  });
});

test("saveAIMemberRuntime does not require saved credentials for managed local Ollama models", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.config.upsertManagedLocalModelEntry({
      entryId: "managed-ollama-entry",
      label: "Local AI on this Mac",
      providerId: "ollama",
      methodId: "ollama-local",
      modelKey: "ollama/gemma4:e2b"
    });

    const result = await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-ollama",
      existingAgentId: "existing-agent",
      name: "AI Ryo",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🧠",
        theme: "onboarding"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: "managed-ollama-entry",
        label: "Local AI on this Mac",
        providerId: "ollama",
        modelKey: "ollama/gemma4:e2b"
      }
    });
    const commands = await readCommands(logPath);

    assert.equal(result.agentId, "existing-agent");
    assert.equal(result.requiresGatewayApply, true);
    assert.equal(countCommands(commands, "models --agent existing-agent auth paste-token --provider ollama --profile-id ollama:chillclaw-existing-agent"), 0);
  }, {
    cleanModelRuntime: true
  });
});

test("saveAIMemberRuntime keeps a managed local Ollama brain when model status cannot resolve config", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.config.upsertManagedLocalModelEntry({
      entryId: "managed-ollama-entry",
      label: "Local AI on this Mac",
      providerId: "ollama",
      methodId: "ollama-local",
      modelKey: "ollama/gemma4:e2b"
    });

    const result = await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-ollama",
      existingAgentId: "existing-agent",
      name: "AI Ryo",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🧠",
        theme: "onboarding"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: "managed-ollama-entry",
        label: "Local AI on this Mac",
        providerId: "ollama",
        modelKey: "ollama/gemma4:e2b"
      }
    });
    const commands = await readCommands(logPath);

    assert.equal(result.agentId, "existing-agent");
    assert.equal(result.requiresGatewayApply, true);
    assert.equal(countCommands(commands, "models --agent existing-agent auth paste-token --provider ollama --profile-id ollama:chillclaw-existing-agent"), 0);
  }, {
    cleanModelRuntime: true,
    omitModelStatusConfigPath: true
  });
});

test("saveAIMemberRuntime repairs stale local Ollama config when the saved entry predates explicit provider wiring", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath, dataDir }) => {
    const statePath = resolve(dataDir, "openclaw-state.json");
    await writeFile(
      statePath,
      JSON.stringify(
        {
          modelEntries: [
            {
              id: "managed-ollama-entry",
              label: "Local AI on this Mac",
              providerId: "ollama",
              modelKey: "ollama/gemma4:e2b",
              agentId: "",
              agentDir: "",
              workspaceDir: "",
              authMethodId: "ollama-local",
              profileIds: [],
              isDefault: true,
              isFallback: false,
              createdAt: "2026-04-07T00:00:00.000Z",
              updatedAt: "2026-04-07T00:00:00.000Z"
            }
          ],
          defaultModelEntryId: "managed-ollama-entry",
          fallbackModelEntryIds: []
        },
        null,
        2
      )
    );
    await writeFile(
      configPath,
      JSON.stringify(
        {
          agents: {
            defaults: {
              model: {
                primary: "ollama/gemma4:e2b",
                fallbacks: []
              },
              models: {
                "ollama/gemma4:e2b": {}
              }
            }
          }
        },
        null,
        2
      )
    );

    await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-ollama",
      existingAgentId: "existing-agent",
      name: "AI Ryo",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🧠",
        theme: "onboarding"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: "managed-ollama-entry",
        label: "Local AI on this Mac",
        providerId: "ollama",
        modelKey: "ollama/gemma4:e2b"
      }
    });

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      models?: {
        mode?: string;
        providers?: {
          ollama?: {
            baseUrl?: string;
            api?: string;
            apiKey?: string;
            models?: Array<Record<string, unknown>>;
          };
        };
      };
    };

    assert.equal(config.models?.mode, "merge");
    assert.deepEqual(config.models?.providers?.ollama, {
      baseUrl: "http://127.0.0.1:11434",
      api: "ollama",
      apiKey: "ollama-local",
      models: [
        {
          id: "gemma4:e2b",
          name: "gemma4:e2b",
          reasoning: false,
          input: ["text"],
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0
          },
          contextWindow: 131072,
          maxTokens: 8192
        }
      ]
    });
  }, {
    cleanModelRuntime: true
  });
});

test("saveAIMemberRuntime upgrades stale MiniMax entries, avoids inherited fallbacks, and restores provider auth from saved secrets", async () => {
  await withFakeOpenClaw(async ({ configPath, dataDir }) => {
    const secrets = new InMemorySecretsAdapter();
    await secrets.set(modelAuthSecretName("minimax", "minimax-api", "apiKey"), "sk-minimax");
    const adapter = new OpenClawAdapter(secrets);
    const statePath = resolve(dataDir, "openclaw-state.json");
    await writeFile(
      statePath,
      JSON.stringify(
        {
          modelEntries: [
            {
              id: "runtime:minimax-minimax-m2-5",
              label: "MiniMax M2.5",
              providerId: "minimax",
              modelKey: "minimax/MiniMax-M2.5",
              agentId: "",
              agentDir: "",
              workspaceDir: "",
              authMethodId: "minimax-api",
              profileIds: [],
              isDefault: true,
              isFallback: false,
              createdAt: "2026-03-30T00:00:00.000Z",
              updatedAt: "2026-03-30T00:00:00.000Z"
            }
          ],
          defaultModelEntryId: "runtime:minimax-minimax-m2-5",
          fallbackModelEntryIds: []
        },
        null,
        2
      )
    );

    const result = await adapter.aiEmployees.saveAIMemberRuntime({
      memberId: "member-minimax",
      existingAgentId: "existing-agent",
      name: "MiniMax Brain",
      jobTitle: "Research Assistant",
      avatar: {
        presetId: "operator",
        accent: "var(--avatar-1)",
        emoji: "🦊",
        theme: "sunrise"
      },
      personality: "Calm and methodical",
      soul: "Helpful and precise",
      workStyles: ["Methodical"],
      skillIds: [],
      selectedSkills: [],
      capabilitySettings: {
        memoryEnabled: true,
        contextWindow: 128000
      },
      knowledgePacks: [],
      brain: {
        entryId: "runtime:minimax-minimax-m2-5",
        label: "MiniMax M2.5",
        providerId: "minimax",
        modelKey: "minimax/MiniMax-M2.5"
      }
    });
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: {
        list?: Array<{
          id?: string;
          model?: string | { primary?: string; fallbacks?: string[] };
        }>;
      };
    };
    const savedAgent = config.agents?.list?.find((entry) => entry.id === "existing-agent");
    const authStore = JSON.parse(await readFile("/tmp/agent/auth-profiles.json", "utf8")) as {
      profiles?: Record<string, { provider?: string }>;
    };

    assert.equal(result.requiresGatewayApply, true);
    assert.deepEqual(savedAgent?.model, {
      primary: "minimax/MiniMax-M2.7",
      fallbacks: []
    });
    assert.deepEqual(Object.keys(authStore.profiles ?? {}), ["minimax:chillclaw-existing-agent"]);
  }, {
    minimaxCatalog: true
  });
});

test("plugin manager installs and enables the managed WeChat plugin", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.plugins.installPlugin("wecom");
    const commands = await readCommands(logPath);

    assert.equal(result.pluginConfig.entries[0]?.installed, true);
    assert.equal(result.pluginConfig.entries[0]?.enabled, true);
    assert.equal(countCommands(commands, "plugins install @wecom/wecom-openclaw-plugin"), 1);
    assert.equal(countCommands(commands, "plugins enable wecom-openclaw-plugin"), 1);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  });
});

test("feature requirement preparation can defer gateway restart until WeChat Work config is saved", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.plugins.ensureFeatureRequirements("channel:wechat-work", { deferGatewayRestart: true });
    const commands = await readCommands(logPath);

    assert.equal(result.entries[0]?.installed, true);
    assert.equal(result.entries[0]?.enabled, true);
    assert.equal(countCommands(commands, "plugins install @wecom/wecom-openclaw-plugin"), 1);
    assert.equal(countCommands(commands, "plugins enable wecom-openclaw-plugin"), 1);
    assert.equal(countCommands(commands, "gateway restart"), 0);
  });
});

test("WeChat Work requests repair the legacy invalid channel key before retrying OpenClaw commands", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath }) => {
    await writeFile(configPath, JSON.stringify({
      channels: {
        "wecom-openclaw-plugin": {
          enabled: true,
          botId: "legacy-bot",
          secret: "legacy-secret",
          webhookPath: "/wecom-openclaw-plugin",
          token: "legacy-token",
          encodingAESKey: "legacy-aes"
        }
      }
    }));

    const result = await adapter.plugins.ensureFeatureRequirements("channel:wechat-work", { deferGatewayRestart: true });
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: Record<string, Record<string, unknown>>;
    };

    assert.equal(result.entries[0]?.installed, true);
    assert.equal(config.channels?.wecom?.enabled, true);
    assert.equal(config.channels?.wecom?.botId, "legacy-bot");
    assert.equal(config.channels?.wecom?.secret, "legacy-secret");
    assert.equal("wecom-openclaw-plugin" in (config.channels ?? {}), false);
  }, {
    invalidLegacyWechatConfig: true
  });
});

test("plugin manager blocks removal while the managed WeChat channel is still configured", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    await adapter.config.saveChannelEntry({
      channelId: "wechat-work",
      action: "save",
      values: {
        botId: "bot-id",
        secret: "corp-secret"
      }
    });

    await assert.rejects(
      () => adapter.plugins.removePlugin("wecom"),
      /still required by an active managed feature/i
    );
  }, {
    failWechatConfigSet: true,
    pluginInstalled: true,
    pluginEnabled: true
  });
});

test("plugin manager surfaces update availability and clears it after update", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const before = await adapter.plugins.getConfigOverview();
    assert.equal(before.entries[0]?.status, "update-available");
    assert.equal(before.entries[0]?.hasUpdate, true);

    const result = await adapter.plugins.updatePlugin("wecom");
    const commands = await readCommands(logPath);

    assert.equal(result.pluginConfig.entries[0]?.hasUpdate, false);
    assert.equal(result.pluginConfig.entries[0]?.status, "ready");
    assert.equal(countCommands(commands, "plugins update wecom-openclaw-plugin --yes"), 1);
    assert.equal(countCommands(commands, "plugins enable wecom-openclaw-plugin"), 1);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  }, {
    pluginInstalled: true,
    pluginEnabled: true,
    pluginUpdateAvailable: true
  });
});

test("AI member runtime candidate discovery uses one agents list and no per-agent bindings reads", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.aiEmployees.listAIMemberRuntimeCandidates();
    const commands = await readCommands(logPath);

    assert.equal(countCommands(commands, "agents list --json --bindings"), 1);
    assert.equal(countCommands(commands, "agents bindings --agent existing-agent --json"), 0);
  });
});

test("engine status and health checks share one version, status, and gateway read", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await Promise.all([adapter.status(), adapter.healthCheck()]);
    const commands = await readCommands(logPath);

    assert.equal(countCommands(commands, "--version"), 1);
    assert.equal(countCommands(commands, "status --json"), 1);
    assert.equal(countCommands(commands, "gateway status --json"), 1);
  });
});

test("installSpec reports the pinned OpenClaw version by default", () => {
  const adapter = new OpenClawAdapter();

  assert.equal(adapter.installSpec.desiredVersion, "2026.4.15");
  assert.equal(
    adapter.installSpec.prerequisites.includes(
      "Permission to install or refresh the managed bundled OpenClaw 2026.4.15 runtime"
    ),
    true
  );
});

test("deployment targets report the pinned OpenClaw version by default", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const overview = await adapter.getDeploymentTargets();

    assert.equal(overview.targets[0]?.desiredVersion, "2026.4.15");
    assert.equal(overview.targets[1]?.desiredVersion, "2026.4.15");
  });
});

test("install accepts OpenClaw --version output with label and build metadata", async () => {
  await withFakeOpenClaw(
    async ({ adapter }) => {
      const result = await adapter.install(false, { forceLocal: true });

      assert.equal(result.status, "installed");
      assert.equal(result.actualVersion, "2026.4.15");
      assert.match(result.message, /OpenClaw 2026\.4\.15 is already available/);
    },
    {
      managedOpenClawVersion: "OpenClaw 2026.4.15 (29dc654)"
    }
  );
});

test("install trusts the runtime manager after bundled runtime verification succeeds", async () => {
  const previousLock = fakeOpenClawLock;
  let releaseLock = () => {};
  fakeOpenClawLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-openclaw-runtime-manager-install-test-"));
  const dataDir = join(tempDir, "data");
  const fakeHome = join(tempDir, "home");
  const managedBinDir = join(dataDir, "openclaw-runtime", "node_modules", ".bin");
  const managedBinary = join(managedBinDir, "openclaw");
  const configPath = join(fakeHome, ".openclaw", "openclaw.json");
  const firstVersionProbeMarker = join(tempDir, "first-version-probe");
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalHome = process.env.HOME;

  await mkdir(managedBinDir, { recursive: true });
  await mkdir(join(fakeHome, ".openclaw"), { recursive: true });
  await writeFile(configPath, "{}");

  const runtimeResource = {
    id: "openclaw-runtime",
    kind: "engine",
    label: "OpenClaw runtime",
    status: "ready",
    sourcePolicy: ["bundled"],
    updatePolicy: "stage-silently-apply-safely",
    installedVersion: "2026.4.15",
    desiredVersion: "2026.4.15",
    activePath: managedBinary,
    updateAvailable: false,
    blockingResourceIds: [],
    summary: "OpenClaw runtime is ready.",
    detail: "The runtime manager verified the bundled OpenClaw CLI."
  };
  const runtimeManager = {
    prepare: async () => {
      await mkdir(managedBinDir, { recursive: true });
      await writeFile(
        managedBinary,
        `#!/bin/sh
if [ "$1" = "--version" ]; then
  if [ ! -f ${JSON.stringify(firstVersionProbeMarker)} ]; then
    touch ${JSON.stringify(firstVersionProbeMarker)}
    exit 1
  fi
  echo "OpenClaw 2026.4.15 (runtime-manager)"
elif [ "$1" = "models" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"configPath":${JSON.stringify(configPath)},"auth":{"providers":[],"oauth":{"providers":[]}}}'
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  echo '{"setup":{"required":false},"gateway":{"reachable":true},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"rpc":{"ok":true},"service":{"installed":true,"loaded":true}}'
else
  echo '{}'
fi
`
      );
      await chmod(managedBinary, 0o755);
      return {
        epoch: "test",
        revision: 1,
        settled: true,
        action: "prepare",
        status: "completed",
        message: "OpenClaw runtime is ready.",
        resource: runtimeResource,
        runtimeManager: {
          checkedAt: "2026-04-25T00:00:00.000Z",
          summary: "Runtime manager is ready.",
          detail: "All managed resources are ready.",
          resources: [runtimeResource]
        }
      } as RuntimeActionResponse;
    }
  } as unknown as RuntimeManager;

  await rm(join(dataDir, "openclaw-runtime"), { recursive: true, force: true });

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.HOME = fakeHome;

  const adapter = new OpenClawAdapter(undefined, runtimeManager);
  adapter.invalidateReadCaches();

  try {
    const result = await adapter.install(false, { forceLocal: true });

    assert.equal(result.status, "installed");
    assert.equal(result.actualVersion, "2026.4.15");
    assert.match(result.message, /OpenClaw 2026\.4\.15/);
  } finally {
    adapter.invalidateReadCaches();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await rm(tempDir, { recursive: true, force: true });
    releaseLock();
  }
});

test("install normalizes managed OpenClaw config with ChillClaw's minimum agent timeout", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath }) => {
    await writeFile(
      configPath,
      JSON.stringify({
        agents: {
          defaults: {
            workspace: "/tmp/openclaw-workspace",
            timeoutSeconds: 30
          }
        }
      })
    );

    await adapter.install(false, { forceLocal: true });

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: { defaults?: { timeoutSeconds?: number; workspace?: string } };
    };

    assert.equal(config.agents?.defaults?.timeoutSeconds, 300);
    assert.equal(config.agents?.defaults?.workspace, "/tmp/openclaw-workspace");
  }, {
    managedOpenClawVersion: "2026.4.15"
  });
});

test("install preserves user OpenClaw agent timeouts above ChillClaw's minimum", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath }) => {
    await writeFile(
      configPath,
      JSON.stringify({
        agents: {
          defaults: {
            timeoutSeconds: 600
          }
        }
      })
    );

    await adapter.install(false, { forceLocal: true });

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: { defaults?: { timeoutSeconds?: number } };
    };

    assert.equal(config.agents?.defaults?.timeoutSeconds, 600);
  }, {
    managedOpenClawVersion: "2026.4.15"
  });
});

test("environment runtime preference ignores a managed OpenClaw command", async () => {
  const originalPreference = process.env.CHILLCLAW_OPENCLAW_RUNTIME_PREFERENCE;
  process.env.CHILLCLAW_OPENCLAW_RUNTIME_PREFERENCE = "environment";

  try {
    await withFakeOpenClaw(
      async ({ adapter, logPath }) => {
        const status = await adapter.status();
        const commands = await readCommands(logPath);

        assert.equal(status.installed, true);
        assert.equal(status.version, "2026.3.21");
        assert.equal(commands.includes("system --version"), true);
        assert.equal(commands.includes("--version"), false);
      },
      {
        systemOpenClawVersion: "2026.3.21"
      }
    );
  } finally {
    if (originalPreference === undefined) {
      delete process.env.CHILLCLAW_OPENCLAW_RUNTIME_PREFERENCE;
    } else {
      process.env.CHILLCLAW_OPENCLAW_RUNTIME_PREFERENCE = originalPreference;
    }
  }
});

test("install requires Runtime Manager for managed-local runtime instead of npm fallback", async () => {
  const previousLock = fakeOpenClawLock;
  let releaseLock = () => {};
  fakeOpenClawLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-openclaw-managed-install-test-"));
  const dataDir = join(tempDir, "data");
  const nodeVersion = "99.0.0";
  const nodeDistName = `node-v${nodeVersion}-darwin-${process.arch === "x64" ? "x64" : "arm64"}`;
  const nodeDistRoot = join(tempDir, nodeDistName);
  const nodeBinDir = join(nodeDistRoot, "bin");
  const nodeArchivePath = join(tempDir, `${nodeDistName}.tar.gz`);
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalManagedNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const originalManagedNodeDistUrl = process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;
  const restorePlatform = mockProcessPlatform("darwin");

  await mkdir(dataDir, { recursive: true });
  await mkdir(nodeBinDir, { recursive: true });
  await writeFile(
    join(nodeBinDir, "node"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "v${nodeVersion}"
  exit 0
fi
script="$1"
shift
exec /bin/sh "$script" "$@"
`
  );
  await writeFile(
    join(nodeBinDir, "npm"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "10.9.0"
  exit 0
fi
if [ "$1" = "prefix" ] && [ "$2" = "--global" ]; then
  echo ${JSON.stringify(join(tempDir, "npm-prefix"))}
  exit 0
fi
if [ "$1" = "root" ] && [ "$2" = "--global" ]; then
  echo ${JSON.stringify(join(tempDir, "npm-root"))}
  exit 0
fi
if [ "$1" = "install" ] && [ "$2" = "--prefix" ]; then
  prefix="$3"
  mkdir -p "$prefix/node_modules/.bin"
  cat > "$prefix/node_modules/.bin/openclaw" <<'EOF'
#!/usr/bin/env node
if [ "$1" = "--version" ]; then
  echo "2026.4.15"
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  echo '{"setup":{"required":false},"gateway":{"reachable":true},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"rpc":{"ok":true},"service":{"installed":true,"loaded":true}}'
elif [ "$1" = "update" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"availability":{"available":false},"update":{"installKind":"package","packageManager":"npm","registry":{"latestVersion":"2026.4.15"}},"channel":{"label":"stable"}}'
else
  echo '{}'
fi
EOF
  chmod +x "$prefix/node_modules/.bin/openclaw"
  exit 0
fi
exit 1
`
  );
  await chmod(join(nodeBinDir, "node"), 0o755);
  await chmod(join(nodeBinDir, "npm"), 0o755);
  await execFile("/usr/bin/tar", ["-czf", nodeArchivePath, "-C", tempDir, nodeDistName]);

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = nodeVersion;
  process.env.CHILLCLAW_MANAGED_NODE_DIST_URL = pathToFileURL(nodeArchivePath).href;

  const adapter = new OpenClawAdapter();
  adapter.invalidateReadCaches();

  try {
    await assert.rejects(
      () => adapter.install(false, { forceLocal: true }),
      /managed runtime manager is unavailable/i
    );
  } finally {
    restorePlatform();
    adapter.invalidateReadCaches();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalManagedNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalManagedNodeVersion;
    }
    if (originalManagedNodeDistUrl === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_DIST_URL = originalManagedNodeDistUrl;
    }
    await rm(tempDir, { recursive: true, force: true });
    releaseLock();
  }
});

test("install normalizes reused OpenClaw gateway config to ChillClaw's local baseline", async () => {
  const previousLock = fakeOpenClawLock;
  let releaseLock = () => {};
  fakeOpenClawLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-openclaw-config-normalize-test-"));
  const dataDir = join(tempDir, "data");
  const managedBinDir = join(dataDir, "openclaw-runtime", "node_modules", ".bin");
  const managedBinary = join(managedBinDir, "openclaw");
  const fakeHome = join(tempDir, "home");
  const configPath = join(fakeHome, ".openclaw", "openclaw.json");
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalHome = process.env.HOME;

  await mkdir(managedBinDir, { recursive: true });
  await mkdir(join(fakeHome, ".openclaw"), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        gateway: {
          mode: "remote",
          bind: "loopback",
          auth: {
            mode: "token",
            token: "existing-token"
          },
          remote: {
            url: "ws://openclaw.local:18789",
            sshTarget: "home@openclaw.local"
          }
        },
        channels: {
          telegram: {
            enabled: true
          }
        }
      },
      null,
      2
    )
  );
  await writeFile(
    managedBinary,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "2026.4.15"
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  echo '{"configPath":${JSON.stringify(configPath)},"setup":{"required":false},"gateway":{"reachable":false},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
elif [ "$1" = "models" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"configPath":${JSON.stringify(configPath)},"auth":{"providers":[],"oauth":{"providers":[]}}}'
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"rpc":{"ok":false,"error":"gateway url override requires explicit credentials"},"service":{"installed":true,"loaded":true}}'
elif [ "$1" = "update" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"availability":{"available":false},"update":{"installKind":"package","packageManager":"npm","registry":{"latestVersion":"2026.4.15"}},"channel":{"label":"stable"}}'
else
  echo '{}'
fi
`
  );
  await chmod(managedBinary, 0o755);

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.HOME = fakeHome;

  const adapter = new OpenClawAdapter();
  adapter.invalidateReadCaches();

  try {
    const result = await adapter.install(false, { forceLocal: true });
    const normalized = JSON.parse(await readFile(configPath, "utf8")) as {
      gateway?: {
        mode?: string;
        bind?: string;
        auth?: { mode?: string; token?: string };
        remote?: Record<string, unknown>;
      };
      channels?: { telegram?: { enabled?: boolean } };
    };

    assert.equal(result.status, "installed");
    assert.equal(normalized.gateway?.mode, "local");
    assert.equal(normalized.gateway?.bind, "loopback");
    assert.equal(normalized.gateway?.auth?.mode, "token");
    assert.equal(normalized.gateway?.auth?.token, "existing-token");
    assert.equal(normalized.gateway?.remote, undefined);
    assert.equal(normalized.channels?.telegram?.enabled, true);
  } finally {
    adapter.invalidateReadCaches();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await rm(tempDir, { recursive: true, force: true });
    releaseLock();
  }
});

test("updateDeploymentTarget does not run the upstream OpenClaw updater without Runtime Manager", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.updateDeploymentTarget("managed-local");
    const commands = await readCommands(logPath);

    assert.equal(result.status, "failed");
    assert.match(result.message, /managed runtime manager is unavailable/i);
    assert.equal(countCommands(commands, "update --json --yes --no-restart --tag latest"), 0);
    assert.equal(countCommands(commands, "gateway restart"), 0);
  });
});

test("restartGateway issues one gateway restart and reports success when the gateway returns", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.gateway.restartGateway();
    const commands = await readCommands(logPath);

    assert.equal(result.status, "completed");
    assert.match(result.message, /gateway restarted and is reachable/i);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  });
});

test("restartGateway replaces unusable placeholder gateway tokens before verifying reachability", async () => {
  await withFakeOpenClaw(async ({ adapter, configPath }) => {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          gateway: {
            mode: "local",
            bind: "loopback",
            auth: {
              mode: "token",
              token: "__OPENCLAW_GATEWAY_TOKEN__"
            }
          }
        },
        null,
        2
      )
    );

    const result = await adapter.gateway.restartGateway();
    const normalized = JSON.parse(await readFile(configPath, "utf8")) as {
      gateway?: {
        auth?: {
          token?: string;
        };
      };
    };

    assert.equal(result.status, "completed");
    assert.ok(normalized.gateway?.auth?.token);
    assert.notEqual(normalized.gateway?.auth?.token, "__OPENCLAW_GATEWAY_TOKEN__");
    assert.doesNotMatch(normalized.gateway?.auth?.token ?? "", /^__OPENCLAW_/);
  });
});

test("finalizeOnboardingSetup is a no-op when the gateway is already installed and reachable", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, dataDir }) => {
    const statePath = resolve(dataDir, "openclaw-state.json");
    const previousState = await readFile(statePath, "utf8").catch(() => undefined);
    if (previousState !== undefined) {
      await rm(statePath, { force: true });
    }

    try {
      const result = await adapter.gateway.finalizeOnboardingSetup();
      const commands = await readCommands(logPath);

      assert.equal(result.engineStatus.running, true);
      assert.equal(countCommands(commands, "gateway restart"), 0);
      assert.equal(countCommands(commands, "gateway install --json"), 0);
      assert.equal(countCommands(commands, "gateway start"), 0);
    } finally {
      if (previousState !== undefined) {
        await writeFile(statePath, previousState);
      }
    }
  });
});

test("restartGateway installs and starts the gateway service when restart reports it is not loaded", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.gateway.restartGateway();
    const commands = await readCommands(logPath);

    assert.equal(result.status, "completed");
    assert.equal(countCommands(commands, "gateway restart"), 1);
    assert.equal(countCommands(commands, "gateway install --json"), 1);
    assert.equal(countCommands(commands, "gateway start"), 1);
  }, { gatewayServiceLoaded: false });
});

test("finalizeOnboardingSetup installs and starts the gateway service when it is missing", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.gateway.finalizeOnboardingSetup();
    const commands = await readCommands(logPath);

    assert.equal(result.engineStatus.running, true);
    assert.equal(countCommands(commands, "gateway restart"), 1);
    assert.equal(countCommands(commands, "gateway install --json"), 1);
    assert.equal(countCommands(commands, "gateway start"), 1);
  }, { gatewayServiceLoaded: false });
});

test("finalizeOnboardingSetup applies staged gateway changes before completing", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.config.saveChannelEntry({
      channelId: "telegram",
      action: "save",
      values: {
        token: "123:finalize-token",
        accountName: "Finalize Bot"
      }
    });

    const result = await adapter.gateway.finalizeOnboardingSetup();
    const commands = await readCommands(logPath);

    assert.equal(result.engineStatus.pendingGatewayApply, false);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  });
});

test("finalizeOnboardingSetup ignores plugins.allow warnings when the gateway restart otherwise succeeds", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.config.saveChannelEntry({
      channelId: "telegram",
      action: "save",
      values: {
        token: "123:warning-token",
        accountName: "Warning Bot"
      }
    });

    const result = await adapter.gateway.finalizeOnboardingSetup();
    const commands = await readCommands(logPath);

    assert.equal(result.engineStatus.running, true);
    assert.equal(result.engineStatus.pendingGatewayApply, false);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  }, {
    failGatewayRestartWithPluginsAllowWarning: true
  });
});

test("sendChatMessage does not block on --expect-final", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.gateway.sendChatMessage({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:chillclaw-chat:thread-1",
      message: "Hello",
      clientMessageId: "client-1"
    });
    const commands = await readCommands(logPath);

    assert.equal(result.runId, "run-123");
    assert.equal(countCommands(commands, 'gateway call chat.send --json --params {"sessionKey":"agent:existing-agent:chillclaw-chat:thread-1","message":"Hello","idempotencyKey":"client-1"} --expect-final'), 0);
    assert.equal(
      countCommands(
        commands,
        'gateway call chat.send --json --params {"sessionKey":"agent:existing-agent:chillclaw-chat:thread-1","message":"Hello","idempotencyKey":"client-1"} --timeout 120000'
      ),
      1
    );
  });
});

test("chat history maps assistant error messages into failed chat messages", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const detail = await adapter.gateway.getChatThreadDetail({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:chillclaw-chat:thread-1"
    });

    assert.equal(detail.messages[0]?.status, "failed");
    assert.match(detail.messages[0]?.text ?? "", /invalid x-api-key/i);
    assert.match(detail.messages[0]?.error ?? "", /invalid x-api-key/i);
  }, {
    chatHistoryPayload:
      '{"sessionKey":"agent:existing-agent:chillclaw-chat:thread-1","messages":[{"role":"assistant","content":[],"timestamp":1773000000000,"stopReason":"error","errorMessage":"401 {\\"type\\":\\"error\\",\\"error\\":{\\"message\\":\\"invalid x-api-key\\"}}"}]}'
  });
});

test("chat history hides internal tool messages and only exposes visible user and assistant transcript messages", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const detail = await adapter.gateway.getChatThreadDetail({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:chillclaw-chat:thread-1"
    });

    assert.equal(detail.messages.length, 2);
    assert.deepEqual(
      detail.messages.map((message) => ({ role: message.role, text: message.text })),
      [
        { role: "user", text: "what's my name" },
        { role: "assistant", text: "Ryo." }
      ]
    );
  }, {
    chatHistoryPayload:
      '{"sessionKey":"agent:existing-agent:chillclaw-chat:thread-1","messages":[{"role":"user","content":[{"type":"text","text":"what\'s my name"}],"timestamp":1773000000000},{"role":"assistant","content":[{"type":"toolCall","name":"memory_search","partialJson":"{\\"query\\":\\"user name\\"}"}],"timestamp":1773000000001,"stopReason":"toolUse"},{"role":"toolResult","content":[{"type":"text","text":"{\\"results\\":[] ,\\"provider\\":\\"none\\",\\"citations\\":\\"auto\\",\\"mode\\":\\"fts-only\\"}"}],"timestamp":1773000000002},{"role":"assistant","content":[{"type":"text","text":"Ryo."}],"timestamp":1773000000003}]}'
  });
});

test("chat history collapses consecutive assistant messages into one visible reply", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const detail = await adapter.gateway.getChatThreadDetail({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:chillclaw-chat:thread-1"
    });

    assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[0]?.role, "user");
    assert.equal(detail.messages[1]?.role, "assistant");
    assert.match(detail.messages[1]?.text ?? "", /initializing that first/i);
    assert.match(detail.messages[1]?.text ?? "", /quick heads-up/i);
    assert.match(detail.messages[1]?.text ?? "", /yep — i searched/i);
  }, {
    chatHistoryPayload:
      '{"sessionKey":"agent:existing-agent:chillclaw-chat:thread-1","messages":[{"role":"user","content":[{"type":"text","text":"can you search my 小红书 skills"}],"timestamp":1773000000000},{"role":"assistant","content":[{"type":"text","text":"I don’t have a local skill-finder memory set up yet, so I’m initializing that first, then I’ll search for Xiaohongshu-related skills."}],"timestamp":1773000000001,"stopReason":"toolUse"},{"role":"toolResult","content":[{"type":"text","text":"(no output)"}],"timestamp":1773000000002},{"role":"assistant","content":[{"type":"text","text":"Quick heads-up: this creates a tiny local folder at `~/skill-finder/` and stores only skill-search prefs there. Nothing gets written outside that folder."}],"timestamp":1773000000003,"stopReason":"toolUse"},{"role":"toolResult","content":[{"type":"text","text":"Successfully wrote 142 bytes to /Users/home/skill-finder/memory.md"}],"timestamp":1773000000004},{"role":"assistant","content":[{"type":"text","text":"Yep — I searched for Xiaohongshu/小红书-related skills."}],"timestamp":1773000000005,"stopReason":"stop"}]}'
  });
});
