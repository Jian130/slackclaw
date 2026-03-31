import test from "node:test";
import assert from "node:assert/strict";

import type { ChannelSession, ChannelSetupState, SaveChannelEntryRequest, SupportedChannelId } from "@chillclaw/contracts";

import { ChannelsConfigCoordinator } from "./openclaw-channels-config-coordinator.js";

function channelState(channelId: SupportedChannelId): ChannelSetupState {
  return {
    id: channelId,
    title: channelId,
    officialSupport: channelId !== "wechat",
    status: "ready",
    summary: `${channelId} ready`,
    detail: `${channelId} detail`,
    lastUpdatedAt: "2026-03-30T00:00:00.000Z"
  };
}

function channelSession(channelId: SupportedChannelId, overrides: Partial<ChannelSession> = {}): ChannelSession {
  return {
    id: `${channelId}-session`,
    channelId,
    entryId: `${channelId}:default`,
    status: "running",
    message: `${channelId} running`,
    logs: [],
    ...overrides
  };
}

function createCoordinator(overrides: Partial<ConstructorParameters<typeof ChannelsConfigCoordinator>[0]> = {}) {
  return new ChannelsConfigCoordinator({
    readChannelSnapshot: async () => ({ list: undefined, status: undefined }),
    deriveLiveChannelState: (channelId) => channelState(channelId),
    buildLiveChannelEntries: () => [],
    runOpenClaw: async () => ({ code: 0, stdout: "", stderr: "" }),
    runMutationWithConfigFallback: async ({ applyFallback }) => {
      await applyFallback();
      return { usedFallback: true, result: { code: 0, stdout: "", stderr: "" } };
    },
    removeChannelConfig: async () => undefined,
    markGatewayApplyPending: async () => undefined,
    readInstalledOpenClawVersion: async () => "2026.3.8",
    inspectPlugin: async () => ({ entries: [], diagnostics: [], duplicate: false }),
    restartGatewayAndRequireHealthy: async () => undefined,
    writeFeishuChannelConfig: async () => undefined,
    writeTelegramChannelConfig: async () => undefined,
    writeWechatChannelConfig: async () => undefined,
    resolveOpenClawCommand: async () => process.execPath,
    buildCommandEnv: () => process.env,
    logExternalCommand: () => undefined,
    spawnInteractiveCommand: () => {
      throw new Error("not used in this test");
    },
    managedWechatInstallerDir: process.cwd(),
    wechatInstallerPackageSpec: "@tencent-weixin/openclaw-weixin-cli@latest",
    resolveNpmInvocation: async () => undefined,
    ensureSystemDependencies: async () => undefined,
    runCommand: async () => ({ code: 0, stdout: "", stderr: "" }),
    readWechatInstallerBinName: async () => "weixin-installer",
    fileExists: async () => true,
    writeErrorLog: async () => undefined,
    errorToLogDetails: (error) => error,
    compareVersionStrings: () => 1,
    personalWechatRuntimeChannelKey: "openclaw-weixin",
    feishuBundledSince: "2026.3.7",
    ...overrides
  });
}

test("saveChannelEntry routes channel-specific actions through coordinator-owned workflow policy", async () => {
  const calls: string[] = [];
  const coordinator = createCoordinator({
    runMutationWithConfigFallback: async ({ fallbackDescription, commandArgs, applyFallback }) => {
      calls.push(`${fallbackDescription}:${commandArgs.join(" ")}`);
      await applyFallback();
      return { usedFallback: true, result: { code: 0, stdout: "", stderr: "" } };
    },
    inspectPlugin: async () => {
      calls.push("inspect-feishu");
      return { entries: [{ enabled: true, status: "ok" }], diagnostics: [], duplicate: false };
    },
    writeWechatChannelConfig: async (pluginId, request) => {
      calls.push(`wechat-work:${pluginId}:${request.botId}:${request.secret}`);
    }
  });

  const telegramRequest: SaveChannelEntryRequest = {
    channelId: "telegram",
    values: { token: "bot-token", accountName: "Support" }
  };
  const feishuPrepareRequest: SaveChannelEntryRequest = {
    channelId: "feishu",
    action: "prepare",
    values: {}
  };
  const wechatWorkRequest: SaveChannelEntryRequest = {
    channelId: "wechat-work",
    values: {
      botId: "corp-bot",
      secret: "corp-secret"
    }
  };

  const telegramResult = await coordinator.saveChannelEntry(telegramRequest);
  const feishuResult = await coordinator.saveChannelEntry(feishuPrepareRequest);
  const wechatWorkResult = await coordinator.saveChannelEntry(wechatWorkRequest);

  assert.deepEqual(calls, [
    "channels.telegram config write:channels add --channel telegram --token bot-token --name Support",
    "inspect-feishu",
    "wechat-work:wecom:corp-bot:corp-secret"
  ]);
  assert.match(telegramResult.message, /Telegram bot token saved/i);
  assert.match(feishuResult.message, /Feishu plugin/i);
  assert.match(wechatWorkResult.message, /managed WeChat plugin configuration/i);
});

test("submitChannelSessionInput keeps WhatsApp approval policy in the coordinator", async () => {
  const calls: string[] = [];
  const session = channelSession("whatsapp", {
    id: "whatsapp:default:login",
    logs: ["Pairing started."]
  });

  const coordinator = createCoordinator({
    runOpenClaw: async (args) => {
      calls.push(args.join(":"));
      return { code: 0, stdout: "", stderr: "" };
    }
  });
  (coordinator as unknown as {
    activeLoginSession?: {
      channelId: "whatsapp";
      entryId: string;
      startedAt: string;
      status: "awaiting-pairing";
      logs: string[];
      inputPrompt?: string;
    };
  }).activeLoginSession = {
    channelId: "whatsapp",
    entryId: "whatsapp:default",
    startedAt: "2026-03-30T00:00:00.000Z",
    status: "awaiting-pairing",
    logs: [...session.logs]
  };

  const result = await coordinator.submitChannelSessionInput(session.id, { value: "123456" });

  assert.deepEqual(calls, ["pairing:approve:whatsapp:123456:--notify"]);
  assert.equal(result.status, "completed");
  assert.match(result.message ?? "", /pairing approved/i);
  assert.deepEqual(result.logs, ["Pairing started.", "WhatsApp pairing approved."]);
});
