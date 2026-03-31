import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ChannelSession,
  ChannelSessionInputRequest,
  ChannelSetupState,
  ConfiguredChannelEntry,
  FeishuSetupRequest,
  PairingApprovalRequest,
  RemoveChannelEntryRequest,
  SaveChannelEntryRequest,
  SupportedChannelId,
  TelegramSetupRequest,
  WechatSetupRequest
} from "@chillclaw/contracts";

import {
  managedPluginConfigKeys,
  managedPluginDefinitionForFeature,
} from "../config/managed-plugins.js";
import {
  createChannelState,
  createChannelStateFromLoginSession,
  type ChannelLoginSessionSnapshot,
  toChannelSession
} from "../config/channel-setup-state.js";
import { appendGatewayApplyMessage } from "./openclaw-shared.js";

type LoginSessionState = ChannelLoginSessionSnapshot & {
  startedAt: string;
  child?: ReturnType<typeof spawn>;
  exitCode?: number;
};

type ChannelsConfigAccess = {
  readChannelSnapshot: () => Promise<{ list?: unknown; status?: unknown }>;
  deriveLiveChannelState: (channelId: SupportedChannelId, list?: unknown, status?: unknown) => ChannelSetupState;
  buildLiveChannelEntries: (list?: unknown, status?: unknown) => ConfiguredChannelEntry[];
  runOpenClaw: (
    args: string[],
    options?: { allowFailure?: boolean }
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  runMutationWithConfigFallback: (options: {
    commandArgs: string[];
    fallbackDescription: string;
    fallbackPatterns?: string[];
    applyFallback: () => Promise<void>;
  }) => Promise<{ usedFallback: boolean; result: { code: number; stdout: string; stderr: string } }>;
  removeChannelConfig: (channelKey: string) => Promise<void>;
  markGatewayApplyPending: () => Promise<void>;
  readInstalledOpenClawVersion: () => Promise<string | undefined>;
  inspectPlugin: (pluginId: string) => Promise<{
    entries: Array<{ enabled?: boolean; status?: string; error?: string }>;
    diagnostics: Array<{ level?: string; message?: string }>;
    duplicate: boolean;
    loadError?: string;
  }>;
  restartGatewayAndRequireHealthy: (reason: string) => Promise<unknown>;
  writeFeishuChannelConfig: (request: FeishuSetupRequest) => Promise<void>;
  writeTelegramChannelConfig: (request: TelegramSetupRequest) => Promise<void>;
  writeWechatChannelConfig: (
    pluginId: string,
    request: WechatSetupRequest,
    legacyKeys?: string[]
  ) => Promise<void>;
  resolveOpenClawCommand: () => Promise<string | undefined>;
  buildCommandEnv: (command?: string, envOverrides?: Record<string, string | undefined>) => NodeJS.ProcessEnv;
  logExternalCommand: (command: string, args: string[]) => void;
  spawnInteractiveCommand: (
    command: string,
    args: string[],
    envOverrides?: Record<string, string | undefined>
  ) => ReturnType<typeof spawn>;
  managedWechatInstallerDir: string;
  wechatInstallerPackageSpec: string;
  resolveNpmInvocation: () => Promise<{ command: string; argsPrefix: string[]; display: string } | undefined>;
  ensureSystemDependencies: () => Promise<{ command: string; argsPrefix: string[]; display: string } | undefined>;
  runCommand: (
    command: string,
    args: string[],
    options?: { allowFailure?: boolean; env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number }
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  readWechatInstallerBinName: (packagePath: string) => Promise<string | undefined>;
  fileExists: (pathname: string) => Promise<boolean>;
  writeErrorLog: (message: string, details: unknown, metadata?: { scope?: string }) => Promise<void>;
  errorToLogDetails: (error: unknown) => unknown;
  compareVersionStrings: (left: string, right: string) => number;
  personalWechatRuntimeChannelKey: string;
  feishuBundledSince: string;
};

function channelIdFromEntryId(entryId: string): SupportedChannelId {
  const [channelId] = entryId.split(":");

  if (
    channelId === "telegram" ||
    channelId === "whatsapp" ||
    channelId === "feishu" ||
    channelId === "wechat-work" ||
    channelId === "wechat"
  ) {
    return channelId;
  }

  throw new Error(`Unsupported channel entry id: ${entryId}`);
}

function channelLabel(channelId: SupportedChannelId): string {
  return channelId === "wechat-work"
    ? "WeChat Work"
    : channelId === "wechat"
      ? "WeChat"
      : channelId[0].toUpperCase() + channelId.slice(1);
}

export class ChannelsConfigCoordinator {
  private activeLoginSession?: LoginSessionState;
  private pendingWechatLoginStart?: Promise<{ message: string; channel: ChannelSetupState }>;

  constructor(private readonly access: ChannelsConfigAccess) {}

  async getChannelState(channelId: SupportedChannelId) {
    if (
      this.activeLoginSession?.channelId === channelId &&
      !(channelId === "wechat" && this.activeLoginSession.status === "completed")
    ) {
      return createChannelStateFromLoginSession(channelId, this.activeLoginSession);
    }

    const snapshot = await this.access.readChannelSnapshot();
    return this.access.deriveLiveChannelState(channelId, snapshot.list, snapshot.status);
  }

  async getConfiguredChannelEntries() {
    const snapshot = await this.access.readChannelSnapshot();
    return this.access.buildLiveChannelEntries(snapshot.list, snapshot.status);
  }

  async saveChannelEntry(
    request: SaveChannelEntryRequest
  ): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession; requiresGatewayApply?: boolean }> {
    switch (request.channelId) {
      case "telegram":
        if (request.action === "approve-pairing") {
          return this.approvePairing("telegram", { code: request.values.code ?? "" });
        }

        return this.configureTelegram({
          token: request.values.token ?? "",
          accountName: request.values.accountName
        });
      case "whatsapp":
        if (request.action === "approve-pairing") {
          return this.approvePairing("whatsapp", { code: request.values.code ?? "" });
        }

        {
          const result = await this.startWhatsappLogin();
          return {
            ...result,
            session: result.session ?? (await this.loadChannelSession("whatsapp"))
          };
        }
      case "feishu":
        if (request.action === "prepare") {
          return this.prepareFeishu();
        }

        if (request.action === "approve-pairing") {
          return this.approvePairing("feishu", { code: request.values.code ?? "" });
        }

        return this.configureFeishu({
          appId: request.values.appId ?? "",
          appSecret: request.values.appSecret ?? "",
          domain: request.values.domain,
          botName: request.values.botName
        });
      case "wechat-work":
        if (request.action === "approve-pairing") {
          return this.approvePairing("wechat-work", { code: request.values.code ?? "" });
        }

        return this.configureWechatWorkaround({
          botId: request.values.botId ?? "",
          secret: request.values.secret ?? ""
        });
      case "wechat":
        if (request.action === "approve-pairing") {
          return this.approvePairing("wechat", { code: request.values.code ?? "" });
        }

        {
          const result = await this.startWechatLogin();
          return {
            ...result,
            session: result.session ?? (await this.loadChannelSession("wechat"))
          };
        }
      default:
        throw new Error("Unsupported channel.");
    }
  }

  async removeChannelEntry(
    request: RemoveChannelEntryRequest
  ): Promise<{ message: string; channelId: SupportedChannelId; requiresGatewayApply?: boolean }> {
    const channelId = request.channelId ?? channelIdFromEntryId(request.entryId);

    if (channelId === "whatsapp") {
      await this.access.runOpenClaw(["channels", "logout", "--channel", "whatsapp", "--account", "default"], {
        allowFailure: true
      });
      const remove = await this.access.runOpenClaw(
        ["channels", "remove", "--channel", "whatsapp", "--account", "default", "--delete"],
        { allowFailure: true }
      );

      if (remove.code !== 0) {
        throw new Error(remove.stderr || remove.stdout || "ChillClaw could not remove the WhatsApp configuration.");
      }

      this.activeLoginSession = undefined;
    } else if (channelId === "telegram") {
      const remove = await this.access.runMutationWithConfigFallback({
        commandArgs: ["channels", "remove", "--channel", "telegram", "--account", "default", "--delete"],
        fallbackDescription: "channels.telegram remove",
        fallbackPatterns: ["Unknown channel: telegram"],
        applyFallback: async () => {
          await this.access.removeChannelConfig("telegram");
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "ChillClaw could not remove the Telegram configuration.");
      }
    } else if (channelId === "feishu") {
      const remove = await this.access.runMutationWithConfigFallback({
        commandArgs: ["config", "unset", "channels.feishu"],
        fallbackDescription: "channels.feishu remove",
        applyFallback: async () => {
          await this.access.removeChannelConfig("feishu");
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "ChillClaw could not remove the Feishu configuration.");
      }
    } else if (channelId === "wechat-work") {
      const wechatPlugin = managedPluginDefinitionForFeature("channel:wechat-work");
      if (!wechatPlugin) {
        throw new Error("Managed WeChat plugin definition is missing.");
      }
      const remove = await this.access.runMutationWithConfigFallback({
        commandArgs: ["config", "unset", `channels.${wechatPlugin.configKey}`],
        fallbackDescription: `channels.${wechatPlugin.configKey} remove`,
        applyFallback: async () => {
          for (const channelKey of managedPluginConfigKeys(wechatPlugin)) {
            await this.access.removeChannelConfig(channelKey);
          }
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "ChillClaw could not remove the WeChat configuration.");
      }
    } else if (channelId === "wechat") {
      const remove = await this.access.runMutationWithConfigFallback({
        commandArgs: [
          "channels",
          "remove",
          "--channel",
          this.access.personalWechatRuntimeChannelKey,
          "--account",
          "default",
          "--delete"
        ],
        fallbackDescription: "channels.wechat remove",
        fallbackPatterns: ["Unknown channel", "does not support delete", "plugins.allow is empty"],
        applyFallback: async () => {
          await this.access.removeChannelConfig(this.access.personalWechatRuntimeChannelKey);
        }
      });

      if (!remove.usedFallback && remove.result.code !== 0) {
        throw new Error(remove.result.stderr || remove.result.stdout || "ChillClaw could not remove the WeChat configuration.");
      }

      this.activeLoginSession = undefined;
    } else {
      await this.access.removeChannelConfig(String(channelId));
    }

    await this.access.markGatewayApplyPending();

    return {
      message: appendGatewayApplyMessage(`${channelLabel(channelId)} configuration removed.`),
      channelId,
      requiresGatewayApply: true
    };
  }

  async getActiveChannelSession() {
    return toChannelSession(this.activeLoginSession);
  }

  async getChannelSession(sessionId: string) {
    const session = toChannelSession(this.activeLoginSession, { includeCompleted: true });

    if (!session || session.id !== sessionId) {
      throw new Error("Channel session not found.");
    }

    return session;
  }

  async submitChannelSessionInput(sessionId: string, request: ChannelSessionInputRequest) {
    const session = await this.getChannelSession(sessionId);

    if (session.channelId === "whatsapp") {
      await this.approvePairing("whatsapp", { code: request.value });
      return (await this.getActiveChannelSession()) ?? {
        ...session,
        status: "completed",
        message: "WhatsApp pairing approved.",
        logs: [...session.logs, "WhatsApp pairing approved."]
      };
    }

    return this.submitWechatSessionInput(sessionId, request);
  }

  async startWhatsappLogin(): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession }> {
    const activeSession = this.activeLoginSession;
    if (activeSession?.channelId === "whatsapp" && activeSession.status === "in-progress") {
      return {
        message: "WhatsApp login is already running.",
        channel: await this.getChannelState("whatsapp"),
        session: await this.loadChannelSession("whatsapp")
      };
    }

    await this.access.runOpenClaw(["channels", "add", "--channel", "whatsapp", "--name", "ChillClaw WhatsApp"], {
      allowFailure: true
    });
    await this.access.restartGatewayAndRequireHealthy("WhatsApp configuration");

    const sessionState: LoginSessionState = {
      channelId: "whatsapp",
      entryId: "whatsapp:default",
      startedAt: new Date().toISOString(),
      status: "in-progress",
      logs: ["Starting WhatsApp login. OpenClaw may print a QR code or pairing instructions here."],
      inputPrompt: "Paste the WhatsApp pairing code to finish setup."
    };
    this.activeLoginSession = sessionState;

    const command = await this.access.resolveOpenClawCommand();

    if (!command) {
      throw new Error("OpenClaw CLI is not installed.");
    }

    const loginArgs = ["channels", "login", "--channel", "whatsapp", "--verbose"];
    this.access.logExternalCommand(command, loginArgs);
    const child = spawn(command, loginArgs, {
      env: this.access.buildCommandEnv(command)
    });
    sessionState.child = child;

    const pushLog = (text: string) => {
      if (this.activeLoginSession !== sessionState) {
        return;
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);
      sessionState.logs.push(...lines);
      sessionState.logs = sessionState.logs.slice(-40);
      sessionState.status = "awaiting-pairing";
    };

    child.stdout.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      pushLog(chunk.toString());
    });

    child.on("error", (error) => {
      if (this.activeLoginSession !== sessionState) {
        return;
      }

      sessionState.status = "failed";
      sessionState.logs.push(`Failed to start WhatsApp login: ${error instanceof Error ? error.message : String(error)}`);
      void this.access.writeErrorLog("WhatsApp login session failed to start.", this.access.errorToLogDetails(error), {
        scope: "ChannelsConfigCoordinator.startWhatsappLogin.childError"
      });
    });

    child.on("exit", (code) => {
      if (this.activeLoginSession !== sessionState) {
        return;
      }

      sessionState.exitCode = code ?? 1;
      sessionState.status = code === 0 ? "awaiting-pairing" : "failed";
      sessionState.logs.push(
        code === 0
          ? "WhatsApp login command finished. If pairing is pending, approve the code below."
          : `WhatsApp login command exited with code ${code ?? 1}.`
      );
    });

    return {
      message:
        "ChillClaw restarted the OpenClaw gateway, verified it is reachable, and started the WhatsApp login flow. Follow the QR or pairing instructions shown in the session log.",
      channel: await this.getChannelState("whatsapp"),
      session: await this.loadChannelSession("whatsapp")
    };
  }

  async approvePairing(
    channelId: "telegram" | "whatsapp" | "feishu" | "wechat-work" | "wechat",
    request: PairingApprovalRequest
  ): Promise<{ message: string; channel: ChannelSetupState }> {
    const code = request.code.trim();
    if (!code) {
      throw new Error("Enter the pairing code first.");
    }

    const runtimeChannelId =
      channelId === "wechat-work"
        ? "wecom"
        : channelId === "wechat"
          ? this.access.personalWechatRuntimeChannelKey
          : channelId;
    const result = await this.access.runOpenClaw(["pairing", "approve", runtimeChannelId, code, "--notify"], {
      allowFailure: true
    });

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `ChillClaw could not approve the ${channelId} pairing code.`);
    }

    const activeSession = this.activeLoginSession;
    if (channelId === "whatsapp" && activeSession?.channelId === "whatsapp") {
      activeSession.status = "completed";
      activeSession.logs.push("WhatsApp pairing approved.");
    }

    return {
      message: `${channelLabel(channelId)} pairing approved.`,
      channel: createChannelState(channelId, {
        status: "completed",
        summary: `${channelLabel(channelId)} pairing approved.`,
        detail: "This channel is ready for use."
      })
    };
  }

  async prepareFeishu(): Promise<{ message: string; channel: ChannelSetupState }> {
    const pluginSpec = "@openclaw/feishu";
    const cliVersion = await this.access.readInstalledOpenClawVersion();
    const feishuPlugin = await this.access.inspectPlugin("feishu");

    if (feishuPlugin.loadError) {
      await this.access.writeErrorLog("OpenClaw Feishu plugin is present but failed to load.", {
        pluginId: "feishu",
        duplicate: feishuPlugin.duplicate,
        entries: feishuPlugin.entries,
        diagnostics: feishuPlugin.diagnostics
      }, {
        scope: "ChannelsConfigCoordinator.prepareFeishu"
      });
      throw new Error(
        `OpenClaw already has a Feishu plugin, but it failed to load: ${feishuPlugin.loadError}. ChillClaw did not install another copy because that would create duplicate plugin warnings. Repair the installed Feishu plugin first, then retry setup.`
      );
    }

    if (feishuPlugin.entries.length > 0) {
      await this.access.runOpenClaw(["plugins", "enable", "feishu"], { allowFailure: true });

      if (feishuPlugin.duplicate) {
        return {
          message:
            "ChillClaw found an existing Feishu plugin and skipped reinstalling it to avoid another duplicate plugin warning. Continue with the Feishu credential wizard.",
          channel: createChannelState("feishu", {
            status: "ready",
            summary: "Feishu plugin already present.",
            detail:
              "OpenClaw already has a Feishu plugin and also reports a duplicate Feishu plugin entry. ChillClaw reused the existing plugin instead of installing another copy. Continue with setup, then clean up the older duplicate plugin copy later."
          })
        };
      }

      return {
        message:
          cliVersion && this.access.compareVersionStrings(cliVersion, this.access.feishuBundledSince) >= 0
            ? `OpenClaw ${cliVersion} already bundles the official Feishu plugin, so ChillClaw reused it.`
            : "ChillClaw found the official Feishu plugin already installed and ready to use.",
        channel: createChannelState("feishu", {
          status: "ready",
          summary: "Feishu plugin already present.",
          detail:
            cliVersion && this.access.compareVersionStrings(cliVersion, this.access.feishuBundledSince) >= 0
              ? `OpenClaw ${cliVersion} already includes the official Feishu plugin. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw.`
              : "The official Feishu plugin is already present. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw."
        })
      };
    }

    if (cliVersion && this.access.compareVersionStrings(cliVersion, this.access.feishuBundledSince) >= 0) {
      throw new Error(
        `OpenClaw ${cliVersion} should already include the official Feishu plugin, but ChillClaw could not detect a usable Feishu plugin entry. ChillClaw did not run a separate plugin install because newer OpenClaw versions bundle Feishu already. Repair the installed OpenClaw plugin state first, then retry setup.`
      );
    }

    const install = await this.access.runOpenClaw(["plugins", "install", pluginSpec], { allowFailure: true });

    if (install.code !== 0) {
      throw new Error(install.stderr || install.stdout || `ChillClaw could not install the official Feishu plugin ${pluginSpec}.`);
    }

    await this.access.runOpenClaw(["plugins", "enable", "feishu"], { allowFailure: true });
    await this.access.restartGatewayAndRequireHealthy("Feishu plugin preparation");

    return {
      message:
        "ChillClaw ran `openclaw plugins install @openclaw/feishu`, restarted the OpenClaw gateway, and verified it is reachable.",
      channel: createChannelState("feishu", {
        status: "ready",
        summary: "Official Feishu plugin installed.",
        detail:
          "The plugin is installed and the gateway is reachable. Continue to the Feishu credential wizard to save App ID, App Secret, domain, and bot settings into OpenClaw."
      })
    };
  }

  private async configureFeishu(
    request: FeishuSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    const configSave = await this.access.runMutationWithConfigFallback({
      commandArgs: [
        "config",
        "set",
        "--strict-json",
        "channels.feishu",
        JSON.stringify({
          enabled: true,
          domain: request.domain ?? "feishu",
          dmPolicy: "pairing",
          groupPolicy: "open",
          useLongConnection: true,
          accounts: {
            default: {
              appId: request.appId,
              appSecret: request.appSecret,
              ...(request.botName?.trim() ? { botName: request.botName.trim() } : {})
            }
          }
        })
      ],
      fallbackDescription: "channels.feishu config write",
      applyFallback: async () => {
        await this.access.writeFeishuChannelConfig(request);
      }
    });

    if (!configSave.usedFallback && configSave.result.code !== 0) {
      throw new Error(configSave.result.stderr || configSave.result.stdout || "ChillClaw could not save the Feishu configuration into OpenClaw.");
    }

    await this.access.markGatewayApplyPending();

    return {
      message:
        "ChillClaw saved your Feishu app credentials into OpenClaw. Apply pending changes from Gateway Manager, then enable long connection, publish the Feishu app, send a test DM, and approve the pairing code in ChillClaw.",
      channel: createChannelState("feishu", {
        status: "awaiting-pairing",
        summary: "Official Feishu plugin configured.",
        detail: `OpenClaw saved the ${request.domain ?? "feishu"} tenant credentials. Apply pending gateway changes, switch Feishu event delivery to long connection, publish the app, send a DM to the bot, then approve the Feishu pairing code in ChillClaw.`
      }),
      requiresGatewayApply: true
    };
  }

  private async configureTelegram(
    request: TelegramSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    const args = ["channels", "add", "--channel", "telegram", "--token", request.token];

    if (request.accountName?.trim()) {
      args.push("--name", request.accountName.trim());
    }

    const result = await this.access.runMutationWithConfigFallback({
      commandArgs: args,
      fallbackDescription: "channels.telegram config write",
      fallbackPatterns: ["Unknown channel: telegram"],
      applyFallback: async () => {
        await this.access.writeTelegramChannelConfig(request);
      }
    });

    if (!result.usedFallback && result.result.code !== 0) {
      throw new Error(result.result.stderr || result.result.stdout || "ChillClaw could not save the Telegram channel configuration.");
    }

    await this.access.markGatewayApplyPending();

    return {
      message:
        "Telegram bot token saved. Apply pending changes from Gateway Manager, send a message to the bot, then approve the pairing code in ChillClaw.",
      channel: createChannelState("telegram", {
        status: "awaiting-pairing",
        summary: "Telegram token saved.",
        detail:
          "The Telegram bot is configured. Apply pending gateway changes, send the first message to your bot, then approve the pairing code."
      }),
      requiresGatewayApply: true
    };
  }

  private async configureWechatWorkaround(
    request: WechatSetupRequest
  ): Promise<{ message: string; channel: ChannelSetupState; requiresGatewayApply?: boolean }> {
    const wechatPlugin = managedPluginDefinitionForFeature("channel:wechat-work");
    if (!wechatPlugin) {
      throw new Error("Managed WeChat plugin definition is missing.");
    }

    await this.access.writeWechatChannelConfig(
      wechatPlugin.configKey,
      request,
      wechatPlugin.legacyConfigKeys ?? []
    );
    await this.access.markGatewayApplyPending();

    return {
      message:
        "ChillClaw saved the managed WeChat plugin configuration. Apply pending changes from Gateway Manager, send a DM to the app, then approve the pairing code.",
      channel: createChannelState("wechat-work", {
        status: "awaiting-pairing",
        summary: "WeChat Work is configured and waiting for pairing approval.",
        detail:
          "The managed WeCom plugin is configured. Apply pending gateway changes, send a DM to the app, then approve the pairing code."
      }),
      requiresGatewayApply: true
    };
  }

  private async startWechatLogin(): Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession }> {
    const activeSession = this.activeLoginSession;
    if (
      activeSession?.channelId === "wechat" &&
      activeSession.status !== "failed" &&
      activeSession.status !== "completed"
    ) {
      return {
        message: "WeChat login is already running.",
        channel: await this.getChannelState("wechat"),
        session: await this.loadChannelSession("wechat")
      };
    }

    const pendingStart = this.pendingWechatLoginStart;
    if (pendingStart) {
      const result = await pendingStart;
      return {
        ...result,
        session: await this.loadChannelSession("wechat")
      };
    }

    const startPromise = (async () => {
      const env = this.access.buildCommandEnv();
      const command = await this.ensureWechatInstallerCommand();

      const installerArgs = ["install"];
      this.access.logExternalCommand(command, installerArgs);
      const child = this.access.spawnInteractiveCommand(command, installerArgs, env);
      let settleStartup: (() => void) | undefined;
      const startupReady = new Promise<void>((resolve) => {
        settleStartup = resolve;
      });
      let startupFlushTimer: ReturnType<typeof setTimeout> | undefined;
      const settleStartupSoon = (delayMs = 150) => {
        if (!settleStartup) {
          return;
        }

        if (startupFlushTimer) {
          clearTimeout(startupFlushTimer);
        }

        startupFlushTimer = setTimeout(() => {
          settleStartup?.();
          settleStartup = undefined;
          startupFlushTimer = undefined;
        }, delayMs);
      };
      const settleStartupNow = () => {
        if (startupFlushTimer) {
          clearTimeout(startupFlushTimer);
          startupFlushTimer = undefined;
        }
        settleStartup?.();
        settleStartup = undefined;
      };
      const startupTimer = setTimeout(() => {
        settleStartupNow();
      }, 1000);

      const sessionState: LoginSessionState = {
        channelId: "wechat",
        entryId: "wechat:default",
        startedAt: new Date().toISOString(),
        status: "in-progress",
        logs: [
          "Installing WeChat runtime helper: npm install @tencent-weixin/openclaw-weixin-cli@latest",
          `Running installer: ${[command, ...installerArgs].join(" ")}`,
          "Starting the personal WeChat installer.",
          "Follow the QR code and login guidance printed below."
        ],
        child
      };
      this.activeLoginSession = sessionState;

      const pushLog = (text: string) => {
        if (this.activeLoginSession !== sessionState) {
          return;
        }

        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter(Boolean);
        if (lines.length === 0) {
          return;
        }
        sessionState.logs.push(...lines);
        sessionState.logs = sessionState.logs.slice(-40);
        sessionState.status = "awaiting-pairing";
        settleStartupSoon();
      };

      child.stdout?.on("data", (chunk) => {
        pushLog(chunk.toString());
      });

      child.stderr?.on("data", (chunk) => {
        pushLog(chunk.toString());
      });

      child.on("error", (error) => {
        if (this.activeLoginSession !== sessionState) {
          return;
        }

        sessionState.status = "failed";
        sessionState.logs.push(`Failed to start WeChat login: ${error instanceof Error ? error.message : String(error)}`);
        settleStartupNow();
        void this.access.writeErrorLog("WeChat login session failed to start.", this.access.errorToLogDetails(error), {
          scope: "ChannelsConfigCoordinator.startWechatLogin.childError"
        });
      });

      child.on("close", (code) => {
        if (this.activeLoginSession !== sessionState) {
          return;
        }

        sessionState.exitCode = code ?? 1;
        sessionState.child = undefined;
        sessionState.status = code === 0 ? "completed" : "failed";
        sessionState.logs.push(
          code === 0
            ? "WeChat installer finished. ChillClaw saved this channel and will finish gateway activation after onboarding."
            : `WeChat installer exited with code ${code ?? 1}.`
        );
        settleStartupNow();
      });

      await startupReady.finally(() => {
        if (startupFlushTimer) {
          clearTimeout(startupFlushTimer);
        }
        clearTimeout(startupTimer);
      });

      return {
        message:
          "ChillClaw started the personal WeChat installer. Follow the QR-first login instructions in the channel session log.",
        channel: createChannelState("wechat", {
          status: "awaiting-pairing",
          summary: "Personal WeChat login started.",
          detail:
            "Follow the QR-first WeChat installer logs, then complete any remaining confirmation steps from the session."
        })
      };
    })();

    this.pendingWechatLoginStart = startPromise;
    try {
      const result = await startPromise;
      return {
        ...result,
        session: await this.loadChannelSession("wechat")
      };
    } finally {
      if (this.pendingWechatLoginStart === startPromise) {
        this.pendingWechatLoginStart = undefined;
      }
    }
  }

  private async loadChannelSession(channelId: "whatsapp" | "wechat"): Promise<ChannelSession | undefined> {
    return (
      (await this.getActiveChannelSession()) ??
      (await this.getChannelSession(`${channelId}:default:login`).catch(() => undefined))
    );
  }

  private async submitWechatSessionInput(sessionId: string, request: ChannelSessionInputRequest): Promise<ChannelSession> {
    const session = await this.getChannelSession(sessionId);

    if (!this.activeLoginSession || this.activeLoginSession.channelId !== "wechat") {
      throw new Error("WeChat login session not found.");
    }

    if (this.activeLoginSession.child?.stdin && !this.activeLoginSession.child.stdin.destroyed) {
      this.activeLoginSession.child.stdin.write(`${request.value}\n`);
      this.activeLoginSession.logs.push("Submitted follow-up WeChat input to the installer.");
    } else {
      this.activeLoginSession.logs.push(
        "ChillClaw recorded the WeChat follow-up input, but the installer is no longer accepting stdin."
      );
    }

    return (await this.getActiveChannelSession()) ?? session;
  }

  private async ensureWechatInstallerCommand(): Promise<string> {
    const installPath = this.access.managedWechatInstallerDir;
    await mkdir(installPath, { recursive: true });

    const npmInvocation = await this.access.resolveNpmInvocation();
    const ensuredNpmInvocation = npmInvocation ?? (await this.access.ensureSystemDependencies());

    if (!ensuredNpmInvocation) {
      throw new Error("ChillClaw could not find a working npm installation to prepare the personal WeChat helper.");
    }

    const installArgs = ["install", "--prefix", installPath, this.access.wechatInstallerPackageSpec];
    const installResult = await this.access.runCommand(
      ensuredNpmInvocation.command,
      [...ensuredNpmInvocation.argsPrefix, ...installArgs],
      { allowFailure: true }
    );

    if (installResult.code !== 0) {
      await this.access.writeErrorLog("Personal WeChat installer package install failed.", {
        command: ensuredNpmInvocation.display,
        args: installArgs,
        result: installResult
      }, {
        scope: "ChannelsConfigCoordinator.ensureWechatInstallerCommand.install"
      });
      throw new Error(
        installResult.stderr ||
          installResult.stdout ||
          "ChillClaw could not install the personal WeChat helper package."
      );
    }

    const installerCommand = await this.resolveWechatInstallerCommand(installPath);
    if (!installerCommand) {
      throw new Error(
        `ChillClaw installed ${this.access.wechatInstallerPackageSpec}, but could not find its generated CLI entry in ${installPath}.`
      );
    }

    return installerCommand;
  }

  private async resolveWechatInstallerCommand(installPath: string): Promise<string | undefined> {
    const packagePath = resolve(
      installPath,
      "node_modules",
      "@tencent-weixin",
      "openclaw-weixin-cli",
      "package.json"
    );
    const discoveredBinName = await this.access.readWechatInstallerBinName(packagePath);
    const candidateNames = [
      discoveredBinName,
      "weixin-installer",
      "openclaw-weixin-cli"
    ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

    for (const binName of candidateNames) {
      const candidatePath = resolve(
        installPath,
        "node_modules",
        ".bin",
        process.platform === "win32" ? `${binName}.cmd` : binName
      );
      if (await this.access.fileExists(candidatePath)) {
        return candidatePath;
      }
    }

    return undefined;
  }
}
