import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { AppControlResponse } from "@chillclaw/contracts";

import {
  getAppRootDir,
  getDefaultAppSupportDir,
  getLaunchAgentLabel,
  getLaunchAgentPlistPath
} from "../runtime-paths.js";
import { errorToLogDetails, logDevelopmentCommand, writeErrorLog } from "./logger.js";

function scheduleExit(serverClose: () => void, delayMs = 400): void {
  setTimeout(() => {
    serverClose();
    setTimeout(() => process.exit(0), 150);
  }, delayMs);
}

async function spawnDetachedShell(scriptPath: string): Promise<void> {
  try {
    logDevelopmentCommand("app-control", "/bin/sh", [scriptPath]);
    const child = spawn("/bin/sh", [scriptPath], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });

    child.on("error", (error) => {
      void writeErrorLog("ChillClaw could not start a detached app control script.", {
        scriptPath,
        error: errorToLogDetails(error)
      });
    });

    child.unref();
  } catch (error) {
    await writeErrorLog("ChillClaw could not spawn a detached app control script.", {
      scriptPath,
      error: errorToLogDetails(error)
    });
    throw error;
  }
}

export class AppControlService {
  constructor(private readonly stopServer: () => void) {}

  async stopApp(): Promise<AppControlResponse> {
    scheduleExit(this.stopServer);

    return {
      action: "stop-app",
      status: "completed",
      message: "ChillClaw is stopping its local daemon. This page should close shortly."
    };
  }

  async uninstallApp(): Promise<AppControlResponse> {
    const appRoot = getAppRootDir();
    const appSupportDir = getDefaultAppSupportDir();
    const launchAgentLabel = getLaunchAgentLabel();
    const launchAgentPlistPath = getLaunchAgentPlistPath();
    const appBundlePath = appRoot ? resolve(appRoot, "..", "..") : undefined;
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const tempScriptPath = resolve("/tmp", "chillclaw-uninstall.sh");

    await mkdir(dirname(tempScriptPath), { recursive: true });
    await writeFile(
      tempScriptPath,
      `#!/bin/sh
set -eu

sleep 2
${uid !== undefined ? `/bin/launchctl bootout "gui/${uid}/${launchAgentLabel}" >/dev/null 2>&1 || true` : "true"}
/bin/rm -f "${launchAgentPlistPath}"
/bin/rm -rf "${appSupportDir}"
${appBundlePath ? `/bin/rm -rf "${appBundlePath}"` : ""}
/bin/rm -f "${tempScriptPath}"
`,
      { mode: 0o755 }
    );

    await spawnDetachedShell(tempScriptPath);
    scheduleExit(this.stopServer, 500);

    return {
      action: "uninstall-app",
      status: "completed",
      message: appBundlePath
        ? "ChillClaw scheduled uninstall. It will stop, remove its LaunchAgent and data, and then remove the app bundle."
        : "ChillClaw scheduled uninstall. It will stop and remove its LaunchAgent and local data."
    };
  }
}
