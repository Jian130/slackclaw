import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { AppServiceActionResponse, AppServiceStatus } from "@slackclaw/contracts";

import {
  getAppRootDir,
  getLaunchAgentLabel,
  getLaunchAgentPlistPath,
  getScriptsDir
} from "../runtime-paths.js";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function run(command: string, args: string[], options?: { allowFailure?: boolean }): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
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
      const result = {
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (!options?.allowFailure && result.code !== 0) {
        reject(new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`));
        return;
      }

      resolvePromise(result);
    });
  });
}

export class AppServiceManager {
  async getStatus(): Promise<AppServiceStatus> {
    if (process.platform !== "darwin") {
      return {
        mode: "unmanaged",
        installed: false,
        running: false,
        managedAtLogin: false,
        label: undefined,
        summary: "SlackClaw background service is only managed on macOS.",
        detail: "LaunchAgent management is not available on this platform."
      };
    }

    const appRoot = getAppRootDir();
    const label = getLaunchAgentLabel();
    const plistPath = getLaunchAgentPlistPath();

    if (!appRoot) {
      return {
        mode: "adhoc",
        installed: false,
        running: true,
        managedAtLogin: false,
        label,
        summary: "SlackClaw is running in development mode without a LaunchAgent.",
        detail: "Build and run the packaged macOS app to install login-time background service management."
      };
    }

    const installed = await fileExists(plistPath);
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;

    if (uid === undefined) {
      return {
        mode: "launchagent",
        installed,
        running: false,
        managedAtLogin: installed,
        label,
        summary: installed
          ? "SlackClaw LaunchAgent is installed."
          : "SlackClaw LaunchAgent is not installed yet.",
        detail: installed
          ? `LaunchAgent file exists at ${plistPath}, but the current user session could not be inspected.`
          : `LaunchAgent file not found at ${plistPath}.`
      };
    }

    const launchctl = await run("launchctl", ["print", `gui/${uid}/${label}`], { allowFailure: true });
    const running = launchctl.code === 0;

    return {
      mode: "launchagent",
      installed,
      running,
      managedAtLogin: installed,
      label,
      summary: running
        ? "SlackClaw background service is running at login."
        : installed
          ? "SlackClaw LaunchAgent is installed but not running."
          : "SlackClaw background service is not installed yet.",
      detail: running
        ? `LaunchAgent ${label} is loaded for the current user session.`
        : installed
          ? launchctl.stderr || launchctl.stdout || "The LaunchAgent exists but launchctl did not report it as running."
          : `Install the LaunchAgent to keep SlackClaw available after login.`
    };
  }

  async install(): Promise<AppServiceActionResponse> {
    return this.runAction("install", "install-launchagent.sh");
  }

  async restart(): Promise<AppServiceActionResponse> {
    return this.runAction("restart", "restart-launchagent.sh");
  }

  async uninstall(): Promise<AppServiceActionResponse> {
    return this.runAction("uninstall", "uninstall-launchagent.sh");
  }

  private async runAction(
    action: AppServiceActionResponse["action"],
    scriptName: string
  ): Promise<AppServiceActionResponse> {
    const scriptsDir = getScriptsDir();

    if (process.platform !== "darwin" || !scriptsDir || !(await fileExists(resolve(scriptsDir, scriptName)))) {
      const service = await this.getStatus();

      return {
        action,
        status: "failed",
        message: "SlackClaw LaunchAgent management is only available from the packaged macOS app.",
        service
      };
    }

    const scriptPath = resolve(scriptsDir, scriptName);
    const result = await run("/bin/sh", [scriptPath], { allowFailure: true });
    const service = await this.getStatus();

    return {
      action,
      status: result.code === 0 ? "completed" : "failed",
      message:
        result.code === 0
          ? action === "install"
            ? "SlackClaw background service was installed and started."
            : action === "restart"
              ? "SlackClaw background service was restarted."
              : "SlackClaw background service was removed."
          : result.stderr || result.stdout || "SlackClaw service action failed.",
      service
    };
  }
}
