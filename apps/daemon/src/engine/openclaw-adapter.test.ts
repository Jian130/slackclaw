import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ModelCatalogEntry } from "@slackclaw/contracts";

import {
  OpenClawAdapter,
  buildGatewaySocketConnectParams,
  isGlobalNpmManagedOpenClawCommand,
  isVisibleAIMemberAgentId,
  parseClawHubExploreOutput,
  parseClawHubSearchOutput,
  reconcileSavedEntriesWithRuntime,
  summarizeTargetUpdateStatus
} from "./openclaw-adapter.js";

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

test("AI member detection includes every real OpenClaw agent id", () => {
  assert.equal(isVisibleAIMemberAgentId("main"), true);
  assert.equal(isVisibleAIMemberAgentId("slackclaw-model-openai"), true);
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
    const members = await adapter.listAIMemberRuntimeCandidates();

    assert.equal(members.length, 3);
    assert.deepEqual(
      members.map((member) => member.agentId),
      ["main", "slackclaw-model-openai", "existing-agent"]
    );
    assert.equal(members[2]?.name, "Existing Agent");
    assert.equal(members[2]?.emoji, "🧭");
    assert.equal(members[2]?.bindingCount, 2);
  });
});

test("AI member discovery falls back to stderr when OpenClaw writes JSON there", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const members = await adapter.listAIMemberRuntimeCandidates();

    assert.equal(members.length, 3);
    assert.deepEqual(
      members.map((member) => member.agentId),
      ["main", "slackclaw-model-openai", "stderr-agent"]
    );
    assert.equal(members[2]?.bindingCount, 1);
  }, {
    agentsListJsonOnStderr: true
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
      displayName: "SlackClaw daemon",
      version: "0.1.2",
      platform: "darwin",
      mode: "backend"
    },
    caps: ["tool-events"],
    auth: {
      token: "gateway-token"
    },
    role: "operator",
    scopes: ["operator.admin"]
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

test("summarizeTargetUpdateStatus prefers registry latest version when update lookup is partially available", () => {
  const status = summarizeTargetUpdateStatus(
    {
      update: {
        registry: {
          latestVersion: "2026.3.12",
          error: "AbortError: This operation was aborted"
        }
      },
      channel: {
        label: "stable (default)"
      },
      availability: {
        available: false,
        latestVersion: null
      }
    },
    "SlackClaw could not check for updates."
  );

  assert.equal(status.updateAvailable, false);
  assert.equal(status.latestVersion, "2026.3.12");
  assert.match(status.summary, /2026\.3\.12/);
});

let fakeOpenClawLock: Promise<void> = Promise.resolve();

async function withFakeOpenClaw(
  fn: (context: { adapter: OpenClawAdapter; logPath: string; configPath: string }) => Promise<void>,
  options?: {
    updateNoChange?: boolean;
    updatePackageManager?: "npm" | "pnpm" | "bun";
    chatHistoryPayload?: string;
    agentsListJsonOnStderr?: boolean;
    cleanModelRuntime?: boolean;
    failTelegramChannelsAdd?: boolean;
    failFeishuConfigSet?: boolean;
    failWechatConfigSet?: boolean;
  }
): Promise<void> {
  const previousLock = fakeOpenClawLock;
  let releaseLock = () => {};
  fakeOpenClawLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const tempDir = await mkdtemp(resolve(process.cwd(), "apps/daemon/.data/openclaw-cache-test-"));
  const logPath = join(tempDir, "openclaw.log");
  const configPath = join(tempDir, "openclaw.json");
  const versionPath = join(tempDir, "version.txt");
  const updateMarkerPath = join(tempDir, "update-marker.txt");
  const agentDirPath = join(tempDir, "main-agent");
  const dataDir = join(tempDir, "data");
  const binaryPath = join(dataDir, "openclaw-runtime", "node_modules", ".bin", "openclaw");
  const originalPath = process.env.PATH;
  const originalDataDir = process.env.SLACKCLAW_DATA_DIR;
  const originalLogPath = process.env.OPENCLAW_TEST_LOG;
  const originalVersionPath = process.env.OPENCLAW_TEST_VERSION_FILE;
  const originalUpdateMarkerPath = process.env.OPENCLAW_TEST_UPDATE_MARKER;
  const updateNoChange = options?.updateNoChange === true;
  const updatePackageManager = options?.updatePackageManager ?? "npm";
  const agentsListJsonOnStderr = options?.agentsListJsonOnStderr === true;
  const cleanModelRuntime = options?.cleanModelRuntime === true;
  const failTelegramChannelsAdd = options?.failTelegramChannelsAdd === true;
  const failFeishuConfigSet = options?.failFeishuConfigSet === true;
  const failWechatConfigSet = options?.failWechatConfigSet === true;
  const chatHistoryPayload =
    options?.chatHistoryPayload ??
    '{"sessionKey":"agent:existing-agent:slackclaw-chat:thread-1","messages":[{"role":"assistant","content":[{"type":"text","text":"Hello from OpenClaw"}],"timestamp":1773000000000}]}';

  await writeFile(configPath, JSON.stringify({}));
  await writeFile(versionPath, "2026.3.7\n");
  await mkdir(agentDirPath, { recursive: true });
  await mkdir(join(dataDir, "openclaw-runtime", "node_modules", ".bin"), { recursive: true });
  await writeFile(
    binaryPath,
    `#!/bin/sh
echo "$*" >> "$OPENCLAW_TEST_LOG"
if [ "$1" = "--version" ]; then
  cat "$OPENCLAW_TEST_VERSION_FILE"
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  echo '{"setup":{"required":false},"gateway":{"reachable":true},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"rpc":{"ok":true},"service":{"installed":true,"loaded":true}}'
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
  if [ "${cleanModelRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"models":[]}'
  else
    echo '{"models":[{"key":"openai/gpt-5","name":"GPT-5","input":"text","contextWindow":400000,"local":false,"available":true,"tags":["default","configured"],"missing":false},{"key":"anthropic/claude-sonnet-4-6","name":"Claude Sonnet 4.6","input":"text+image","contextWindow":200000,"local":false,"available":true,"tags":["fallback#1","configured"],"missing":false}]}'
  fi
elif [ "$1" = "models" ] && [ "$2" = "list" ] && [ "$3" = "--all" ] && [ "$4" = "--json" ]; then
  echo '{"models":[{"key":"openai/gpt-5","name":"GPT-5","input":"text","contextWindow":400000,"local":false,"available":true,"tags":["default","configured"],"missing":false},{"key":"anthropic/claude-sonnet-4-6","name":"Claude Sonnet 4.6","input":"text+image","contextWindow":200000,"local":false,"available":true,"tags":["fallback#1","configured"],"missing":false},{"key":"google/gemini-2.5-pro","name":"Gemini 2.5 Pro","input":"text+image","contextWindow":1000000,"local":false,"available":true,"tags":[],"missing":false}]}'
elif [ "$1" = "models" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  if [ "${cleanModelRuntime ? "1" : "0"}" = "1" ]; then
    echo '{"configPath":${JSON.stringify(configPath)},"agentDir":${JSON.stringify(agentDirPath)},"auth":{"providers":[],"oauth":{"providers":[]}}}'
  else
    echo '{"configPath":${JSON.stringify(configPath)},"agentDir":${JSON.stringify(agentDirPath)},"defaultModel":"openai/gpt-5","resolvedDefault":"openai/gpt-5","fallbacks":["anthropic/claude-sonnet-4-6"],"auth":{"providers":[],"oauth":{"providers":[]}}}'
  fi
elif [ "$1" = "models" ] && [ "$2" = "auth" ] && [ "$3" = "login" ] && [ "$4" = "--provider" ] && [ "$5" = "openai-codex" ]; then
  cat > ${JSON.stringify(join(agentDirPath, "auth-profiles.json"))} <<'EOF'
{"version":1,"profiles":{"openai-codex:slackclaw":{"provider":"openai-codex","type":"oauth","label":"OpenAI Codex OAuth"}},"usageStats":{},"order":{"openai-codex":["openai-codex:slackclaw"]},"lastGood":{"openai-codex":"openai-codex:slackclaw"}}
EOF
  echo 'Open this URL to continue sign-in: https://auth.openai.example/authorize'
  sleep 0.1
elif [ "$1" = "channels" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  echo '{"chat":{"telegram":["default"]}}'
elif [ "$1" = "channels" ] && [ "$2" = "status" ] && [ "$3" = "--json" ] && [ "$4" = "--probe" ]; then
  echo '{"channels":{"telegram":{"configured":true,"running":true,"linked":true}},"channelAccounts":{"telegram":[{"accountId":"default","configured":true,"linked":true,"probe":{"bot":{"username":"support_bot"}}}]}}'
elif [ "$1" = "channels" ] && [ "$2" = "add" ] && [ "$3" = "--channel" ] && [ "$4" = "telegram" ] && [ "${failTelegramChannelsAdd ? "1" : "0"}" = "1" ]; then
  >&2 echo 'Unknown channel: telegram'
  exit 1
elif [ "$1" = "config" ] && [ "$2" = "set" ] && [ "$3" = "--strict-json" ] && [ "$4" = "channels.feishu" ] && [ "${failFeishuConfigSet ? "1" : "0"}" = "1" ]; then
  >&2 echo 'unknown option --strict-json'
  exit 1
elif [ "$1" = "config" ] && [ "$2" = "set" ] && [ "$3" = "--strict-json" ] && [ "$4" = "channels.wecom-app" ] && [ "${failWechatConfigSet ? "1" : "0"}" = "1" ]; then
  >&2 echo 'unknown option --strict-json'
  exit 1
elif [ "$1" = "skills" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  echo '{"workspaceDir":"/tmp/skills","managedSkillsDir":"/tmp/skills","skills":[]}'
elif [ "$1" = "skills" ] && [ "$2" = "check" ]; then
  echo '- All good'
elif [ "$1" = "agents" ] && [ "$2" = "list" ] && [ "$3" = "--json" ] && [ "$4" = "--bindings" ]; then
  if [ "${agentsListJsonOnStderr ? "1" : "0"}" = "1" ]; then
    >&2 echo '[plugins] feishu_doc: Registered feishu_doc, feishu_app_scopes'
    >&2 echo '[{"id":"main","identityName":"Maggie","bindings":0},{"id":"slackclaw-model-openai","identityName":"OpenAI Helper","bindings":0},{"id":"stderr-agent","identityName":"Stderr Agent","identityEmoji":"🦊","workspace":"/tmp/stderr-workspace","agentDir":"/tmp/stderr-agent","model":"openai/gpt-5","bindings":1}]'
    >&2 echo '[plugins] feishu_chat: Registered feishu_chat tool'
  else
    echo '[plugins] feishu_doc: Registered feishu_doc, feishu_app_scopes'
    echo '[{"id":"main","identityName":"Maggie","bindings":0},{"id":"slackclaw-model-openai","identityName":"OpenAI Helper","bindings":0},{"id":"existing-agent","identityName":"Existing Agent","identityEmoji":"🧭","workspace":"/tmp/workspace","agentDir":"/tmp/agent","model":"openai/gpt-5","bindings":2}]'
    echo '[plugins] feishu_chat: Registered feishu_chat tool'
  fi
elif [ "$1" = "agents" ] && [ "$2" = "bindings" ]; then
  echo '[{"id":"telegram:default","target":"telegram:default"}]'
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

  if (originalPath === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = originalPath;
  }
  process.env.SLACKCLAW_DATA_DIR = dataDir;
  process.env.OPENCLAW_TEST_LOG = logPath;
  process.env.OPENCLAW_TEST_VERSION_FILE = versionPath;
  process.env.OPENCLAW_TEST_UPDATE_MARKER = updateMarkerPath;

  const adapter = new OpenClawAdapter();
  adapter.invalidateReadCaches();

  try {
    await fn({ adapter, logPath, configPath });
  } finally {
    adapter.invalidateReadCaches();
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalDataDir === undefined) {
      delete process.env.SLACKCLAW_DATA_DIR;
    } else {
      process.env.SLACKCLAW_DATA_DIR = originalDataDir;
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

test("OpenClaw model config uses the full provider catalog and one status read per refresh cycle", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const config = await adapter.getModelConfig();
    const commands = await readCommands(logPath);

    assert.equal(countCommands(commands, "models list --json"), 1);
    assert.equal(countCommands(commands, "models status --json"), 1);
    assert.equal(countCommands(commands, "models list --all --json"), 1);
    assert.deepEqual(config.models.map((model) => model.key), [
      "openai/gpt-5",
      "anthropic/claude-sonnet-4-6",
      "google/gemini-2.5-pro"
    ]);
  });
});

test("OpenClaw model config clears stale configured models when the live runtime is clean", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const statePath = resolve(process.cwd(), "apps/daemon/.data", "openclaw-state.json");
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

      const config = await adapter.getModelConfig();

      assert.equal(config.models.length, 0);
      assert.equal(config.savedEntries.length, 0);
      assert.equal(config.defaultModel, undefined);
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
    const created = await adapter.createSavedModelEntry({
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

    let session = await adapter.getModelAuthSession(created.authSession!.id);
    for (let attempt = 0; attempt < 10 && session.session.status === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      session = await adapter.getModelAuthSession(created.authSession!.id);
    }
    const commands = await readCommands(logPath);

    assert.equal(session.session.status, "completed");
    assert.match(session.session.message, /apply.*gateway|saved/i);
    assert.ok(session.modelConfig.savedEntries.some((entry) => entry.label === "OpenAI Codex"));
    assert.equal(
      commands.some((command) => command.startsWith("agents add slackclaw-model-") || command.startsWith("agents set-identity --agent slackclaw-model-")),
      false
    );
    assert.equal(countCommands(commands, "models auth login --provider openai-codex"), 1);
    assert.equal(countCommands(commands, "gateway restart"), 0);

    const status = await adapter.status();
    assert.equal(status.pendingGatewayApply, true);
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

test("configureTelegram falls back to direct config writes when the command path rejects telegram", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    const result = await adapter.configureTelegram({
      token: "123:fake-token",
      accountName: "Fallback Bot"
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
    const result = await adapter.saveCustomSkill(undefined, {
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
    const modelConfig = await adapter.getModelConfig();
    const brainEntry = modelConfig.savedEntries[0];
    const result = await adapter.saveAIMemberRuntime({
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

test("restartGateway clears the pending apply flag after staged changes", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    await adapter.configureTelegram({
      token: "123:fake-token",
      accountName: "Apply Bot"
    });

    const before = await adapter.status();
    assert.equal(before.pendingGatewayApply, true);

    const result = await adapter.restartGateway();

    assert.equal(result.status, "completed");
    assert.equal(result.engineStatus.pendingGatewayApply, false);

    const after = await adapter.status();
    assert.equal(after.pendingGatewayApply, false);
  });
});

test("configureFeishu falls back to direct config writes when config set drifts", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    const result = await adapter.configureFeishu({
      appId: "cli-app-id",
      appSecret: "cli-app-secret",
      domain: "feishu",
      botName: "SlackClaw Feishu"
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

test("configureWechatWorkaround falls back to direct config writes when config set drifts", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath, configPath }) => {
    const result = await adapter.configureWechatWorkaround({
      pluginSpec: "@openclaw-china/wecom-app",
      corpId: "corp-id",
      agentId: "1000001",
      secret: "corp-secret",
      token: "verify-token",
      encodingAesKey: "aes-key"
    });
    const commands = await readCommands(logPath);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      channels?: Record<string, Record<string, unknown>>;
    };
    const saved = config.channels?.["wecom-app"];

    assert.equal(result.requiresGatewayApply, true);
    assert.match(result.message, /apply pending/i);
    assert.equal(countCommands(commands, "gateway restart"), 0);
    assert.equal(saved?.enabled, true);
    assert.equal(saved?.corpId, "corp-id");
    assert.equal(saved?.agentId, 1000001);
  }, {
    failWechatConfigSet: true
  });
});

test("AI member runtime candidate discovery uses one agents list and no per-agent bindings reads", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    await adapter.listAIMemberRuntimeCandidates();
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

test("installSpec reports latest by default", () => {
  const adapter = new OpenClawAdapter();

  assert.equal(adapter.installSpec.desiredVersion, "latest");
  assert.equal(
    adapter.installSpec.prerequisites.includes("Permission to install or reuse the latest available OpenClaw CLI"),
    true
  );
});

test("deployment targets report latest as the desired install version by default", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const overview = await adapter.getDeploymentTargets();

    assert.equal(overview.targets[0]?.desiredVersion, "latest");
    assert.equal(overview.targets[1]?.desiredVersion, "latest");
  });
});

test("install refreshes managed-local command resolution after npm creates the runtime", async () => {
  const previousLock = fakeOpenClawLock;
  let releaseLock = () => {};
  fakeOpenClawLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const tempDir = await mkdtemp(resolve(process.cwd(), "apps/daemon/.data/openclaw-managed-install-test-"));
  const dataDir = join(tempDir, "data");
  const binDir = join(tempDir, "bin");
  const npmPath = join(binDir, "npm");
  const originalPath = process.env.PATH;
  const originalDataDir = process.env.SLACKCLAW_DATA_DIR;

  await mkdir(dataDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await writeFile(
    npmPath,
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
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "2026.3.13"
elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  echo '{"setup":{"required":false},"gateway":{"reachable":true},"gatewayService":{"installed":true},"providers":{"summary":{"missingProfiles":0}}}'
elif [ "$1" = "gateway" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"rpc":{"ok":true},"service":{"installed":true,"loaded":true}}'
elif [ "$1" = "update" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  echo '{"availability":{"available":false},"update":{"installKind":"package","packageManager":"npm","registry":{"latestVersion":"2026.3.13"}},"channel":{"label":"stable"}}'
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
  await chmod(npmPath, 0o755);

  process.env.PATH = originalPath ? `${binDir}:${originalPath}` : binDir;
  process.env.SLACKCLAW_DATA_DIR = dataDir;

  const adapter = new OpenClawAdapter();
  adapter.invalidateReadCaches();

  try {
    const result = await adapter.install(false, { forceLocal: true });

    assert.equal(result.status, "installed");
    assert.match(result.actualVersion ?? "", /2026\.3\.13/);
    assert.match(result.message, /2026\.3\.13/);
  } finally {
    adapter.invalidateReadCaches();
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalDataDir === undefined) {
      delete process.env.SLACKCLAW_DATA_DIR;
    } else {
      process.env.SLACKCLAW_DATA_DIR = originalDataDir;
    }
    await rm(tempDir, { recursive: true, force: true });
    releaseLock();
  }
});

test("updateDeploymentTarget fails when the command succeeds but the active version does not advance", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const result = await adapter.updateDeploymentTarget("managed-local");

    assert.equal(result.status, "failed");
    assert.match(result.message, /still .*2026\.3\.7.*2026\.3\.12/i);
  }, { updateNoChange: true });
});

test("updateDeploymentTarget still attempts the updater when status reports pnpm", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.updateDeploymentTarget("managed-local");
    const commands = await readCommands(logPath);

    assert.equal(result.status, "completed");
    assert.equal(countCommands(commands, "update --json --yes --no-restart --tag latest"), 1);
  }, { updatePackageManager: "pnpm" });
});

test("updateDeploymentTarget restarts the gateway after a successful update", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.updateDeploymentTarget("managed-local");
    const commands = await readCommands(logPath);

    assert.equal(result.status, "completed");
    assert.match(result.message, /gateway restarted and is reachable/i);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  });
});

test("restartGateway issues one gateway restart and reports success when the gateway returns", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.restartGateway();
    const commands = await readCommands(logPath);

    assert.equal(result.status, "completed");
    assert.match(result.message, /gateway restarted and is reachable/i);
    assert.equal(countCommands(commands, "gateway restart"), 1);
  });
});

test("sendChatMessage does not block on --expect-final", async () => {
  await withFakeOpenClaw(async ({ adapter, logPath }) => {
    const result = await adapter.sendChatMessage({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:slackclaw-chat:thread-1",
      message: "Hello",
      clientMessageId: "client-1"
    });
    const commands = await readCommands(logPath);

    assert.equal(result.runId, "run-123");
    assert.equal(countCommands(commands, 'gateway call chat.send --json --params {"sessionKey":"agent:existing-agent:slackclaw-chat:thread-1","message":"Hello","idempotencyKey":"client-1"} --expect-final'), 0);
    assert.equal(
      countCommands(
        commands,
        'gateway call chat.send --json --params {"sessionKey":"agent:existing-agent:slackclaw-chat:thread-1","message":"Hello","idempotencyKey":"client-1"} --timeout 30000'
      ),
      1
    );
  });
});

test("chat history maps assistant error messages into failed chat messages", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const detail = await adapter.getChatThreadDetail({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:slackclaw-chat:thread-1"
    });

    assert.equal(detail.messages[0]?.status, "failed");
    assert.match(detail.messages[0]?.text ?? "", /invalid x-api-key/i);
    assert.match(detail.messages[0]?.error ?? "", /invalid x-api-key/i);
  }, {
    chatHistoryPayload:
      '{"sessionKey":"agent:existing-agent:slackclaw-chat:thread-1","messages":[{"role":"assistant","content":[],"timestamp":1773000000000,"stopReason":"error","errorMessage":"401 {\\"type\\":\\"error\\",\\"error\\":{\\"message\\":\\"invalid x-api-key\\"}}"}]}'
  });
});

test("chat history hides internal tool messages and only exposes visible user and assistant transcript messages", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const detail = await adapter.getChatThreadDetail({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:slackclaw-chat:thread-1"
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
      '{"sessionKey":"agent:existing-agent:slackclaw-chat:thread-1","messages":[{"role":"user","content":[{"type":"text","text":"what\'s my name"}],"timestamp":1773000000000},{"role":"assistant","content":[{"type":"toolCall","name":"memory_search","partialJson":"{\\"query\\":\\"user name\\"}"}],"timestamp":1773000000001,"stopReason":"toolUse"},{"role":"toolResult","content":[{"type":"text","text":"{\\"results\\":[] ,\\"provider\\":\\"none\\",\\"citations\\":\\"auto\\",\\"mode\\":\\"fts-only\\"}"}],"timestamp":1773000000002},{"role":"assistant","content":[{"type":"text","text":"Ryo."}],"timestamp":1773000000003}]}'
  });
});

test("chat history collapses consecutive assistant messages into one visible reply", async () => {
  await withFakeOpenClaw(async ({ adapter }) => {
    const detail = await adapter.getChatThreadDetail({
      threadId: "thread-1",
      agentId: "existing-agent",
      sessionKey: "agent:existing-agent:slackclaw-chat:thread-1"
    });

    assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[0]?.role, "user");
    assert.equal(detail.messages[1]?.role, "assistant");
    assert.match(detail.messages[1]?.text ?? "", /initializing that first/i);
    assert.match(detail.messages[1]?.text ?? "", /quick heads-up/i);
    assert.match(detail.messages[1]?.text ?? "", /yep — i searched/i);
  }, {
    chatHistoryPayload:
      '{"sessionKey":"agent:existing-agent:slackclaw-chat:thread-1","messages":[{"role":"user","content":[{"type":"text","text":"can you search my 小红书 skills"}],"timestamp":1773000000000},{"role":"assistant","content":[{"type":"text","text":"I don’t have a local skill-finder memory set up yet, so I’m initializing that first, then I’ll search for Xiaohongshu-related skills."}],"timestamp":1773000000001,"stopReason":"toolUse"},{"role":"toolResult","content":[{"type":"text","text":"(no output)"}],"timestamp":1773000000002},{"role":"assistant","content":[{"type":"text","text":"Quick heads-up: this creates a tiny local folder at `~/skill-finder/` and stores only skill-search prefs there. Nothing gets written outside that folder."}],"timestamp":1773000000003,"stopReason":"toolUse"},{"role":"toolResult","content":[{"type":"text","text":"Successfully wrote 142 bytes to /Users/home/skill-finder/memory.md"}],"timestamp":1773000000004},{"role":"assistant","content":[{"type":"text","text":"Yep — I searched for Xiaohongshu/小红书-related skills."}],"timestamp":1773000000005,"stopReason":"stop"}]}'
  });
});
