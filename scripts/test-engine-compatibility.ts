#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  engineCompatibilityCapabilities,
  engineCompatibilityManifests,
  type EngineCompatibilityCapabilityId,
  type EngineCompatibilityCheckResult,
  type EngineCompatibilityCheckStatus,
  type EngineCompatibilityReport,
  type EngineCompatibilityRuntimeMode,
  type ModelConfigOverview
} from "@chillclaw/contracts";

import {
  openClawCompatibilitySources,
  parseJsonCommandOutput
} from "../apps/daemon/src/engine/openclaw-compatibility.js";
import { writeScriptLogLine } from "./logging.mjs";

type Args = {
  engine: "openclaw";
  runtime: "system" | "managed" | "all";
  candidateVersion?: string;
  reportDir: string;
  skipStatic: boolean;
  allowDestructiveSystem: boolean;
  keepManagedRuntime: boolean;
};

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const SCRIPT_LABEL = "ChillClaw engine test";

type RuntimeContext = {
  runtimeMode: EngineCompatibilityRuntimeMode;
  reportDir: string;
  tempRoot: string;
  homeDir: string;
  dataDir: string;
  port: number;
  env: NodeJS.ProcessEnv;
  daemon?: ReturnType<typeof spawn>;
  command?: string;
  detectedVersion?: string;
  managedInstall?: CommandResult;
};

const DEFAULT_REPORT_ROOT = resolve(process.cwd(), ".data", "engine-compatibility");
const FALLBACK_PORT = 4650;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    engine: "openclaw",
    runtime: "all",
    reportDir: resolve(DEFAULT_REPORT_ROOT, new Date().toISOString().replace(/[:.]/g, "-")),
    skipStatic: false,
    allowDestructiveSystem: false,
    keepManagedRuntime: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case "--engine":
        args.engine = "openclaw";
        index += 1;
        break;
      case "--runtime":
        args.runtime = (argv[index + 1] as Args["runtime"]) ?? "all";
        index += 1;
        break;
      case "--candidate-version":
        args.candidateVersion = argv[index + 1];
        index += 1;
        break;
      case "--report-dir":
        args.reportDir = resolve(argv[index + 1] ?? args.reportDir);
        index += 1;
        break;
      case "--skip-static":
        args.skipStatic = true;
        break;
      case "--allow-destructive-system":
        args.allowDestructiveSystem = true;
        break;
      case "--keep-managed-runtime":
        args.keepManagedRuntime = true;
        break;
      default:
        break;
    }
  }

  return args;
}

function summarizeStatus(status: EngineCompatibilityCheckStatus): string {
  return status === "passed"
    ? "PASS"
    : status === "failed"
      ? "FAIL"
      : status === "not-supported"
        ? "NOT SUPPORTED"
        : "SKIPPED";
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
        ...options.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      resolveResult({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function resolveSystemOpenClawCommand(): Promise<string | undefined> {
  const result = await runCommand("sh", ["-lc", "command -v openclaw"]).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  return result.code === 0 && result.stdout.startsWith("/") ? result.stdout : undefined;
}

async function readVersion(command: string, env?: NodeJS.ProcessEnv): Promise<string | undefined> {
  const result = await runCommand(command, ["--version"], { env }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  return result.code === 0 && result.stdout ? result.stdout.split(/\s+/)[0] : undefined;
}

async function writeLog(reportDir: string, runtimeMode: EngineCompatibilityRuntimeMode, capabilityId: string, content: string) {
  const filePath = resolve(reportDir, "logs", runtimeMode, `${capabilityId}.log`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return filePath;
}

function createResult(
  runtimeMode: EngineCompatibilityRuntimeMode,
  capabilityId: EngineCompatibilityCapabilityId,
  status: EngineCompatibilityCheckStatus,
  summary: string,
  extras: Partial<EngineCompatibilityCheckResult> = {}
): EngineCompatibilityCheckResult {
  const source = openClawCompatibilitySources[capabilityId];

  return {
    capabilityId,
    runtimeMode,
    status,
    summary,
    affectedAreas: [source.area],
    likelyFilePaths: source.filePaths.map((filePath) => resolve(process.cwd(), filePath)),
    ...extras
  };
}

async function waitForPing(port: number) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry while the daemon boots.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ChillClaw daemon on port ${port}.`);
}

async function requestJson(port: number, path: string, init?: RequestInit) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: {
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(30_000),
      ...init
    });

    const text = await response.text();
    let json: unknown;

    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      json
    };
  } catch (error) {
    return {
      ok: false,
      status: 599,
      text: error instanceof Error ? error.message : String(error),
      json: undefined
    };
  }
}

async function bootstrapManagedRuntime(context: RuntimeContext, candidateVersion?: string) {
  const installPrefix = resolve(context.dataDir, "openclaw-runtime");
  const env = {
    ...context.env,
    CHILLCLAW_OPENCLAW_INSTALL_PREFIX: installPrefix,
    ...(candidateVersion ? { CHILLCLAW_OPENCLAW_VERSION: candidateVersion } : {})
  };

  const result = await runCommand(process.execPath, ["scripts/bootstrap-openclaw.mjs", "--json"], {
    cwd: process.cwd(),
    env
  });

  context.managedInstall = result;
  const managedCommand = resolve(installPrefix, "node_modules", ".bin", "openclaw");
  const detectedVersion = await readVersion(managedCommand, env);
  context.command = detectedVersion ? managedCommand : undefined;
  context.detectedVersion = detectedVersion;
  const logPath = await writeLog(
    context.reportDir,
    context.runtimeMode,
    "install-managed-runtime",
    [`$ node scripts/bootstrap-openclaw.mjs --json`, result.stdout, result.stderr].filter(Boolean).join("\n\n")
  );

  if (result.code !== 0) {
    return createResult(
      context.runtimeMode,
      "install-managed-runtime",
      "failed",
      result.stderr || result.stdout || "Managed runtime bootstrap failed.",
      {
        engineVersion: context.detectedVersion,
        command: "node scripts/bootstrap-openclaw.mjs --json",
        logPath
      }
    );
  }

  return createResult(
    context.runtimeMode,
    "install-managed-runtime",
    "passed",
    candidateVersion
      ? `Managed OpenClaw ${context.detectedVersion ?? candidateVersion} bootstrapped into an isolated ChillClaw data dir.`
      : `Managed OpenClaw ${context.detectedVersion ?? "unknown"} bootstrapped into an isolated ChillClaw data dir.`,
    {
      engineVersion: context.detectedVersion,
      command: "node scripts/bootstrap-openclaw.mjs --json",
      logPath
    }
  );
}

async function startDaemon(context: RuntimeContext) {
  context.daemon = spawn(process.execPath, ["--import", "tsx", "apps/daemon/src/index.ts"], {
    cwd: process.cwd(),
    env: context.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  context.daemon.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  context.daemon.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await waitForPing(context.port);
  await writeLog(
    context.reportDir,
    context.runtimeMode,
    "daemon",
    [`$ node --import tsx apps/daemon/src/index.ts`, stdout, stderr].filter(Boolean).join("\n\n")
  );
}

async function stopDaemon(context: RuntimeContext) {
  context.daemon?.kill("SIGTERM");
  await delay(500);
}

function buildModelValues(method: { fields: Array<{ id: string; secret?: boolean }> }) {
  const values: Record<string, string> = {};

  for (const field of method.fields) {
    const envKey = `CHILLCLAW_COMPAT_${field.id.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`;
    values[field.id] = process.env[envKey] ?? (field.secret ? "compat-secret-value" : "compat-value");
  }

  return values;
}

function findProviderModels(modelConfig: ModelConfigOverview, providerId: string) {
  const provider = modelConfig.providers.find((item) => item.id === providerId);

  if (!provider) {
    return [];
  }

  return modelConfig.models.filter((model) =>
    provider.providerRefs.some((ref) => model.key.startsWith(`${ref.replace(/\/$/, "")}/`))
  );
}

async function runRuntimeChecks(context: RuntimeContext, args: Args) {
  const checks: EngineCompatibilityCheckResult[] = [];

  const overviewResponse = await requestJson(context.port, "/api/overview");
  if (!overviewResponse.ok) {
    checks.push(
      createResult(
        context.runtimeMode,
        "detect-runtime",
        "failed",
        `ChillClaw overview failed with HTTP ${overviewResponse.status}.`,
        {
          logPath: await writeLog(context.reportDir, context.runtimeMode, "detect-runtime", overviewResponse.text)
        }
      )
    );
    return checks;
  }

  const overview = overviewResponse.json as { engine?: { installed?: boolean; version?: string; summary?: string } };
  context.detectedVersion = overview.engine?.version ?? context.detectedVersion;

  const selectedProfileId =
    (overviewResponse.json as { firstRun?: { selectedProfileId?: string }; profiles?: Array<{ id: string }> }).firstRun?.selectedProfileId ??
    (overviewResponse.json as { profiles?: Array<{ id: string }> }).profiles?.[0]?.id ??
    "docs";

  checks.push(
    createResult(
      context.runtimeMode,
      "detect-runtime",
      overview.engine?.installed ? "passed" : "failed",
      overview.engine?.installed
        ? `ChillClaw detected ${context.runtimeMode} OpenClaw ${overview.engine?.version ?? "unknown"}.`
        : overview.engine?.summary ?? "ChillClaw did not detect an installed runtime.",
      {
        engineVersion: context.detectedVersion
      }
    )
  );

  if (args.candidateVersion && context.detectedVersion && context.detectedVersion !== args.candidateVersion) {
    for (const capabilityId of engineCompatibilityManifests.openclaw.supportedCapabilityIds) {
      if (capabilityId === "detect-runtime" || (capabilityId === "install-managed-runtime" && context.runtimeMode === "managed")) {
        continue;
      }

      checks.push(
        createResult(
          context.runtimeMode,
          capabilityId,
          "skipped",
          `Skipped because ${context.runtimeMode} runtime is on ${context.detectedVersion}, not candidate ${args.candidateVersion}.`,
          {
            engineVersion: context.detectedVersion
          }
        )
      );
    }

    return checks;
  }

  const targetsResponse = await requestJson(context.port, "/api/deploy/targets");
  checks.push(
    createResult(
      context.runtimeMode,
      "fetch-deployment-targets",
      targetsResponse.ok ? "passed" : "failed",
      targetsResponse.ok
        ? "ChillClaw returned deployment targets for this runtime."
        : `Deployment target request failed with HTTP ${targetsResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "fetch-deployment-targets", targetsResponse.text)
      }
    )
  );

  if (context.command) {
    const updateDryRun = await runCommand(context.command, ["update", "--dry-run", "--json", "--yes"], { env: context.env });
    const updateJson = parseJsonCommandOutput<{ targetVersion?: string; currentVersion?: string }>(updateDryRun.stdout);
    checks.push(
      createResult(
        context.runtimeMode,
        "update-runtime",
        updateDryRun.code === 0 && Boolean(updateJson)
          ? "passed"
          : "failed",
        updateDryRun.code === 0 && updateJson
          ? `OpenClaw dry-run update parsed successfully (${updateJson.currentVersion ?? "current"} -> ${updateJson.targetVersion ?? "latest"}).`
          : updateDryRun.stderr || updateDryRun.stdout || "OpenClaw dry-run update failed.",
        {
          engineVersion: context.detectedVersion,
          command: `${context.command} update --dry-run --json --yes`,
          logPath: await writeLog(
            context.reportDir,
            context.runtimeMode,
            "update-runtime",
            [`$ ${context.command} update --dry-run --json --yes`, updateDryRun.stdout, updateDryRun.stderr].filter(Boolean).join("\n\n")
          )
        }
      )
    );
  }

  const modelConfigResponse = await requestJson(context.port, "/api/models/config");
  if (!modelConfigResponse.ok) {
    for (const capabilityId of ["add-model", "modify-model", "set-default-model", "set-fallback-model", "remove-model"] as const) {
      checks.push(
        createResult(context.runtimeMode, capabilityId, "failed", `Model config request failed with HTTP ${modelConfigResponse.status}.`)
      );
    }
  } else {
    const modelConfig = modelConfigResponse.json as ModelConfigOverview;
    const provider = modelConfig.providers.find(
      (item) => item.authMethods.some((method) => !method.interactive && method.kind === "api-key") && findProviderModels(modelConfig, item.id).length > 0
    );

    if (!provider) {
      for (const capabilityId of ["add-model", "modify-model", "set-default-model", "set-fallback-model"] as const) {
        checks.push(
          createResult(context.runtimeMode, capabilityId, "skipped", "No non-interactive API-key provider is available for automated model smoke tests.")
        );
      }
    } else {
      const method = provider.authMethods.find((item) => !item.interactive && item.kind === "api-key")!;
      const providerModels = findProviderModels(modelConfig, provider.id);
      const primaryModel = providerModels[0]?.key;
      const secondaryModel = providerModels[1]?.key ?? primaryModel;

      const createResponse = await requestJson(context.port, "/api/models/entries", {
        method: "POST",
        body: JSON.stringify({
          label: "Compatibility Primary",
          providerId: provider.id,
          methodId: method.id,
          modelKey: primaryModel,
          values: buildModelValues(method),
          makeDefault: false,
          useAsFallback: false
        })
      });
      const createJson = createResponse.json as { modelConfig?: ModelConfigOverview } | undefined;
      const createdEntry = createJson?.modelConfig?.savedEntries.find((entry) => entry.label === "Compatibility Primary");

      checks.push(
        createResult(
          context.runtimeMode,
          "add-model",
          createResponse.ok && Boolean(createdEntry) ? "passed" : "failed",
          createResponse.ok && createdEntry ? `Saved model entry ${createdEntry.label} was created.` : `Create model entry failed with HTTP ${createResponse.status}.`,
          {
            engineVersion: context.detectedVersion,
            logPath: await writeLog(context.reportDir, context.runtimeMode, "add-model", createResponse.text)
          }
        )
      );

      if (createdEntry) {
        const modifyResponse = await requestJson(context.port, `/api/models/entries/${createdEntry.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: "Compatibility Primary Updated",
            providerId: provider.id,
            methodId: method.id,
            modelKey: secondaryModel,
            values: {},
            makeDefault: false,
            useAsFallback: false
          })
        });
        const modifyJson = modifyResponse.json as { modelConfig?: ModelConfigOverview } | undefined;
        const modifiedEntry = modifyJson?.modelConfig?.savedEntries.find((entry) => entry.id === createdEntry.id);

        checks.push(
          createResult(
            context.runtimeMode,
            "modify-model",
            modifyResponse.ok && modifiedEntry?.label === "Compatibility Primary Updated" ? "passed" : "failed",
            modifyResponse.ok && modifiedEntry
              ? `Saved model entry ${modifiedEntry.id} was updated.`
              : `Modify model entry failed with HTTP ${modifyResponse.status}.`,
            {
              engineVersion: context.detectedVersion,
              logPath: await writeLog(context.reportDir, context.runtimeMode, "modify-model", modifyResponse.text)
            }
          )
        );

        const fallbackCreateResponse = await requestJson(context.port, "/api/models/entries", {
          method: "POST",
          body: JSON.stringify({
            label: "Compatibility Fallback",
            providerId: provider.id,
            methodId: method.id,
            modelKey: primaryModel,
            values: buildModelValues(method),
            makeDefault: false,
            useAsFallback: false
          })
        });
        const fallbackJson = fallbackCreateResponse.json as { modelConfig?: ModelConfigOverview } | undefined;
        const fallbackEntry = fallbackJson?.modelConfig?.savedEntries.find((entry) => entry.label === "Compatibility Fallback");

        const defaultResponse = await requestJson(context.port, "/api/models/default-entry", {
          method: "POST",
          body: JSON.stringify({ entryId: createdEntry.id })
        });
        const defaultJson = defaultResponse.json as { modelConfig?: ModelConfigOverview } | undefined;
        checks.push(
          createResult(
            context.runtimeMode,
            "set-default-model",
            defaultResponse.ok && defaultJson?.modelConfig?.defaultEntryId === createdEntry.id ? "passed" : "failed",
            defaultResponse.ok
              ? `Saved model entry ${createdEntry.id} is now the default runtime model.`
              : `Set default model failed with HTTP ${defaultResponse.status}.`,
            {
              engineVersion: context.detectedVersion,
              logPath: await writeLog(context.reportDir, context.runtimeMode, "set-default-model", defaultResponse.text)
            }
          )
        );

        if (fallbackEntry) {
          const fallbackResponse = await requestJson(context.port, "/api/models/fallbacks", {
            method: "POST",
            body: JSON.stringify({ entryIds: [fallbackEntry.id] })
          });
          const fallbackResultJson = fallbackResponse.json as { modelConfig?: ModelConfigOverview } | undefined;

          checks.push(
            createResult(
              context.runtimeMode,
              "set-fallback-model",
              fallbackResponse.ok && fallbackResultJson?.modelConfig?.fallbackEntryIds.includes(fallbackEntry.id) ? "passed" : "failed",
              fallbackResponse.ok
                ? `Saved model entry ${fallbackEntry.id} was added to the fallback chain.`
                : `Set fallback model failed with HTTP ${fallbackResponse.status}.`,
              {
                engineVersion: context.detectedVersion,
                logPath: await writeLog(context.reportDir, context.runtimeMode, "set-fallback-model", fallbackResponse.text)
              }
            )
          );
        } else {
          checks.push(
            createResult(context.runtimeMode, "set-fallback-model", "failed", "Could not create a secondary saved model entry for fallback testing.")
          );
        }
      } else {
        checks.push(createResult(context.runtimeMode, "modify-model", "skipped", "Skipped because model creation failed."));
        checks.push(createResult(context.runtimeMode, "set-default-model", "skipped", "Skipped because model creation failed."));
        checks.push(createResult(context.runtimeMode, "set-fallback-model", "skipped", "Skipped because model creation failed."));
      }
    }

    const removeEndpointResponse = await requestJson(context.port, "/api/models/entries/compatibility-probe", {
      method: "DELETE"
    });

    checks.push(
      createResult(
        context.runtimeMode,
        "remove-model",
        removeEndpointResponse.status === 404 ? "not-supported" : removeEndpointResponse.ok ? "passed" : "failed",
        removeEndpointResponse.status === 404
          ? "ChillClaw does not expose saved-model deletion yet."
          : removeEndpointResponse.ok
            ? "Saved model deletion endpoint is available."
            : `Saved model deletion endpoint returned HTTP ${removeEndpointResponse.status}.`,
        {
          engineVersion: context.detectedVersion,
          logPath: await writeLog(context.reportDir, context.runtimeMode, "remove-model", removeEndpointResponse.text)
        }
      )
    );
  }

  const onboardingResponse = await requestJson(context.port, "/api/onboarding", {
    method: "POST",
    body: JSON.stringify({ profileId: selectedProfileId })
  });
  await writeLog(context.reportDir, context.runtimeMode, "channel-onboarding", onboardingResponse.text);

  const addChannelResponse = await requestJson(context.port, "/api/channels/telegram", {
    method: "POST",
    body: JSON.stringify({
      token: "compat-telegram-token",
      accountName: "Compatibility Channel"
    })
  });
  checks.push(
    createResult(
      context.runtimeMode,
      "add-channel",
      addChannelResponse.ok ? "passed" : "failed",
      addChannelResponse.ok
        ? "Telegram channel add flow completed in the compatibility environment."
        : `Telegram channel add flow failed with HTTP ${addChannelResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "add-channel", addChannelResponse.text)
      }
    )
  );

  const modifyChannelResponse = await requestJson(context.port, "/api/channels/telegram", {
    method: "POST",
    body: JSON.stringify({
      token: "compat-telegram-token-updated",
      accountName: "Compatibility Channel Updated"
    })
  });
  checks.push(
    createResult(
      context.runtimeMode,
      "modify-channel",
      modifyChannelResponse.ok ? "passed" : "failed",
      modifyChannelResponse.ok
        ? "Telegram channel modify flow completed in the compatibility environment."
        : `Telegram channel modify flow failed with HTTP ${modifyChannelResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "modify-channel", modifyChannelResponse.text)
      }
    )
  );

  const removeChannelResponse = await requestJson(context.port, "/api/channels/account/compatibility-probe", {
    method: "DELETE"
  });
  checks.push(
    createResult(
      context.runtimeMode,
      "remove-channel",
      removeChannelResponse.status === 404 ? "not-supported" : removeChannelResponse.ok ? "passed" : "failed",
      removeChannelResponse.status === 404
        ? "ChillClaw does not expose generic channel deletion yet."
        : removeChannelResponse.ok
          ? "Generic channel deletion endpoint is available."
          : `Generic channel deletion endpoint returned HTTP ${removeChannelResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "remove-channel", removeChannelResponse.text)
      }
    )
  );

  const restartResponse = await requestJson(context.port, "/api/channels/gateway/start", {
    method: "POST"
  });
  checks.push(
    createResult(
      context.runtimeMode,
      "restart-gateway",
      restartResponse.ok ? "passed" : "failed",
      restartResponse.ok ? "Gateway restart endpoint completed successfully." : `Gateway restart failed with HTTP ${restartResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "restart-gateway", restartResponse.text)
      }
    )
  );

  const healthResponse = await requestJson(context.port, "/api/overview");
  const healthJson = healthResponse.json as { engine?: { running?: boolean; summary?: string } };
  checks.push(
    createResult(
      context.runtimeMode,
      "verify-gateway-health",
      healthResponse.ok && healthJson.engine?.running ? "passed" : "failed",
      healthResponse.ok && healthJson.engine?.running
        ? "Gateway is reachable after restart."
        : healthJson.engine?.summary ?? `Gateway health verification failed with HTTP ${healthResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "verify-gateway-health", healthResponse.text)
      }
    )
  );

  const chatOverviewResponse = await requestJson(context.port, "/api/chat/overview");
  checks.push(
    createResult(
      context.runtimeMode,
      "list-chat-threads",
      chatOverviewResponse.ok ? "passed" : "failed",
      chatOverviewResponse.ok
        ? "Chat overview endpoint returned thread data."
        : `Chat overview failed with HTTP ${chatOverviewResponse.status}.`,
      {
        engineVersion: context.detectedVersion,
        logPath: await writeLog(context.reportDir, context.runtimeMode, "list-chat-threads", chatOverviewResponse.text)
      }
    )
  );

  const aiTeamResponse = await requestJson(context.port, "/api/ai-team/overview");
  const aiTeamJson = aiTeamResponse.json as { members?: Array<{ id: string }> } | undefined;
  const chatMemberId = aiTeamJson?.members?.[0]?.id;

  if (!aiTeamResponse.ok || !chatMemberId) {
    for (const capabilityId of ["create-chat-thread", "load-chat-history", "send-chat-message", "abort-chat-message"] as const) {
      checks.push(
        createResult(
          context.runtimeMode,
          capabilityId,
          "skipped",
          aiTeamResponse.ok
            ? "Skipped because no AI member is available for chat smoke tests."
            : `Skipped because AI member overview failed with HTTP ${aiTeamResponse.status}.`,
          {
            engineVersion: context.detectedVersion,
            logPath: await writeLog(context.reportDir, context.runtimeMode, "chat-member-overview", aiTeamResponse.text)
          }
        )
      );
    }
  } else {
    const createChatResponse = await requestJson(context.port, "/api/chat/threads", {
      method: "POST",
      body: JSON.stringify({
        memberId: chatMemberId,
        mode: "new"
      })
    });
    const createChatJson = createChatResponse.json as { thread?: { id?: string } } | undefined;
    const chatThreadId = createChatJson?.thread?.id;

    checks.push(
      createResult(
        context.runtimeMode,
        "create-chat-thread",
        createChatResponse.ok && Boolean(chatThreadId) ? "passed" : "failed",
        createChatResponse.ok && chatThreadId
          ? "Chat thread creation endpoint returned a thread."
          : `Create chat thread failed with HTTP ${createChatResponse.status}.`,
        {
          engineVersion: context.detectedVersion,
          logPath: await writeLog(context.reportDir, context.runtimeMode, "create-chat-thread", createChatResponse.text)
        }
      )
    );

    if (chatThreadId) {
      const historyResponse = await requestJson(context.port, `/api/chat/threads/${chatThreadId}`);
      checks.push(
        createResult(
          context.runtimeMode,
          "load-chat-history",
          historyResponse.ok ? "passed" : "failed",
          historyResponse.ok
            ? "Chat thread history endpoint returned successfully."
            : `Load chat history failed with HTTP ${historyResponse.status}.`,
          {
            engineVersion: context.detectedVersion,
            logPath: await writeLog(context.reportDir, context.runtimeMode, "load-chat-history", historyResponse.text)
          }
        )
      );

      const sendChatResponse = await requestJson(context.port, `/api/chat/threads/${chatThreadId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          message: "Reply with the single word compatibility."
        })
      });
      checks.push(
        createResult(
          context.runtimeMode,
          "send-chat-message",
          sendChatResponse.ok ? "passed" : "failed",
          sendChatResponse.ok
            ? "Chat message endpoint accepted a message."
            : `Send chat message failed with HTTP ${sendChatResponse.status}.`,
          {
            engineVersion: context.detectedVersion,
            logPath: await writeLog(context.reportDir, context.runtimeMode, "send-chat-message", sendChatResponse.text)
          }
        )
      );

      const abortChatResponse = await requestJson(context.port, `/api/chat/threads/${chatThreadId}/abort`, {
        method: "POST",
        body: JSON.stringify({})
      });
      checks.push(
        createResult(
          context.runtimeMode,
          "abort-chat-message",
          abortChatResponse.ok ? "passed" : "failed",
          abortChatResponse.ok
            ? "Chat abort endpoint completed successfully."
            : `Abort chat message failed with HTTP ${abortChatResponse.status}.`,
          {
            engineVersion: context.detectedVersion,
            logPath: await writeLog(context.reportDir, context.runtimeMode, "abort-chat-message", abortChatResponse.text)
          }
        )
      );
    } else {
      for (const capabilityId of ["load-chat-history", "send-chat-message", "abort-chat-message"] as const) {
        checks.push(
          createResult(
            context.runtimeMode,
            capabilityId,
            "skipped",
            "Skipped because chat thread creation failed.",
            {
              engineVersion: context.detectedVersion
            }
          )
        );
      }
    }
  }

  if (process.env.CHILLCLAW_COMPAT_RUN_TASK === "1") {
    const taskResponse = await requestJson(context.port, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Reply with the word compatibility.",
        profileId: "docs"
      })
    });
    const taskJson = taskResponse.json as { status?: string; summary?: string };
    checks.push(
      createResult(
        context.runtimeMode,
        "run-task-through-default-model",
        taskResponse.ok && taskJson.status === "completed" ? "passed" : "failed",
        taskResponse.ok
          ? `Task endpoint returned status ${taskJson.status ?? "unknown"}.`
          : `Task endpoint failed with HTTP ${taskResponse.status}.`,
        {
          engineVersion: context.detectedVersion,
          logPath: await writeLog(context.reportDir, context.runtimeMode, "run-task-through-default-model", taskResponse.text)
        }
      )
    );
  } else {
    checks.push(
      createResult(
        context.runtimeMode,
        "run-task-through-default-model",
        "skipped",
        "Skipped unless CHILLCLAW_COMPAT_RUN_TASK=1 is set with real model credentials available.",
        {
          engineVersion: context.detectedVersion
        }
      )
    );
  }

  if (context.runtimeMode === "managed") {
    const uninstallResponse = await requestJson(context.port, "/api/engine/uninstall", {
      method: "POST"
    });
    checks.push(
      createResult(
        context.runtimeMode,
        "uninstall-runtime",
        uninstallResponse.ok ? "passed" : "failed",
        uninstallResponse.ok
          ? "Managed runtime uninstall completed successfully in the isolated environment."
          : `Managed runtime uninstall failed with HTTP ${uninstallResponse.status}.`,
        {
          engineVersion: context.detectedVersion,
          logPath: await writeLog(context.reportDir, context.runtimeMode, "uninstall-runtime", uninstallResponse.text)
        }
      )
    );
  } else {
    checks.push(
      createResult(
        context.runtimeMode,
        "uninstall-runtime",
        args.allowDestructiveSystem ? "skipped" : "not-supported",
        args.allowDestructiveSystem
          ? "System runtime uninstall requires a separate destructive workflow and was not run in this suite."
          : "System runtime uninstall is intentionally not run by default because it would mutate the developer's existing install.",
        {
          engineVersion: context.detectedVersion
        }
      )
    );
  }

  return checks;
}

async function runStaticChecks(reportDir: string, skipStatic: boolean) {
  if (skipStatic) {
    return {
      build: "skipped",
      test: "skipped"
    } as EngineCompatibilityReport["staticChecks"];
  }

  const buildResult = await runCommand("npm", ["run", "build"], { cwd: process.cwd() });
  await writeLog(reportDir, "managed", "static-build", [`$ npm run build`, buildResult.stdout, buildResult.stderr].filter(Boolean).join("\n\n"));

  const testResult = await runCommand("npm", ["run", "test"], { cwd: process.cwd() });
  await writeLog(reportDir, "managed", "static-test", [`$ npm run test`, testResult.stdout, testResult.stderr].filter(Boolean).join("\n\n"));

  return {
    build: buildResult.code === 0 ? "passed" : "failed",
    test: testResult.code === 0 ? "passed" : "failed"
  } as EngineCompatibilityReport["staticChecks"];
}

function renderMarkdown(report: EngineCompatibilityReport) {
  const lines: string[] = [];
  lines.push(`# ${report.engine} compatibility report`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  if (report.candidateVersion) {
    lines.push(`- Candidate version: ${report.candidateVersion}`);
  }
  lines.push(`- Static build: ${summarizeStatus(report.staticChecks.build)}`);
  lines.push(`- Static test: ${summarizeStatus(report.staticChecks.test)}`);
  lines.push("");

  for (const runtime of report.runtimes) {
    lines.push(`## ${runtime.runtimeMode} runtime`);
    lines.push("");
    lines.push(`- Detected version: ${runtime.detectedVersion ?? "not detected"}`);
    lines.push("");

    for (const check of runtime.checks) {
      lines.push(`- ${summarizeStatus(check.status)} ${check.capabilityId}: ${check.summary}`);
      if (check.logPath) {
        lines.push(`  - Log: ${check.logPath}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function createRuntimeContext(runtimeMode: EngineCompatibilityRuntimeMode, reportDir: string, port: number): Promise<RuntimeContext> {
  const tempRoot = await mkdtemp(resolve(tmpdir(), `chillclaw-compat-${runtimeMode}-`));
  const homeDir = resolve(tempRoot, "home");
  const dataDir = resolve(tempRoot, "data");
  await mkdir(homeDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  return {
    runtimeMode,
    reportDir,
    tempRoot,
    homeDir,
    dataDir,
    port,
    env: {
      ...process.env,
      HOME: homeDir,
      CHILLCLAW_DATA_DIR: dataDir,
      CHILLCLAW_PORT: String(port)
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.reportDir, { recursive: true });

  const report: EngineCompatibilityReport = {
    engine: args.engine,
    generatedAt: new Date().toISOString(),
    candidateVersion: args.candidateVersion,
    staticChecks: await runStaticChecks(args.reportDir, args.skipStatic),
    runtimes: []
  };

  const runtimeModes: EngineCompatibilityRuntimeMode[] =
    args.runtime === "all" ? ["system", "managed"] : [args.runtime];

  for (const [offset, runtimeMode] of runtimeModes.entries()) {
    const context = await createRuntimeContext(runtimeMode, args.reportDir, FALLBACK_PORT + offset);

    try {
      if (runtimeMode === "system") {
        context.command = await resolveSystemOpenClawCommand();
        context.detectedVersion = context.command ? await readVersion(context.command, context.env) : undefined;
      } else {
        const installCheck = await bootstrapManagedRuntime(context, args.candidateVersion);
        report.runtimes.push({
          runtimeMode,
          detectedVersion: context.detectedVersion,
          checks: [installCheck]
        });
      }

      if (!context.command) {
        const missingChecks = engineCompatibilityCapabilities.map((capability) =>
          createResult(
            runtimeMode,
            capability.id,
            capability.id === "detect-runtime" ? "failed" : "skipped",
            capability.id === "detect-runtime"
              ? "No OpenClaw command was detected for this runtime."
              : "Skipped because no runtime command was available."
          )
        );

        if (runtimeMode === "managed") {
          report.runtimes[report.runtimes.length - 1].checks.push(...missingChecks.filter((check) => check.capabilityId !== "install-managed-runtime"));
        } else {
          report.runtimes.push({
            runtimeMode,
            detectedVersion: context.detectedVersion,
            checks: missingChecks
          });
        }
        continue;
      }

      await startDaemon(context);
      const checks = await runRuntimeChecks(context, args);

      if (runtimeMode === "managed") {
        report.runtimes[report.runtimes.length - 1].checks.push(...checks);
        report.runtimes[report.runtimes.length - 1].detectedVersion = context.detectedVersion;
      } else {
        report.runtimes.push({
          runtimeMode,
          detectedVersion: context.detectedVersion,
          checks
        });
      }
    } finally {
      await stopDaemon(context);
      if (!(args.keepManagedRuntime && runtimeMode === "managed")) {
        await rm(context.tempRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  const jsonPath = resolve(args.reportDir, `${args.engine}-compatibility-report.json`);
  const markdownPath = resolve(args.reportDir, `${args.engine}-compatibility-report.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(markdownPath, renderMarkdown(report));

  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "test-engine-compatibility.main",
    message: `Compatibility report written to ${jsonPath}`
  });
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "test-engine-compatibility.main",
    message: `Summary written to ${markdownPath}`
  });
}

void main().catch(async (error) => {
  const output = error instanceof Error ? error.stack ?? error.message : String(error);
  await mkdir(DEFAULT_REPORT_ROOT, { recursive: true }).catch(() => undefined);
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "test-engine-compatibility.main",
    message: output,
    stream: "stderr"
  });
  process.exitCode = 1;
});
