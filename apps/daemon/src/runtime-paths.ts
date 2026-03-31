import { homedir } from "node:os";
import { resolve } from "node:path";

export function getDataDir(): string {
  return process.env.CHILLCLAW_DATA_DIR ?? resolve(process.cwd(), "apps/daemon/.data");
}

export function getManagedOpenClawDir(): string {
  return resolve(getDataDir(), "openclaw-runtime");
}

export function getManagedOpenClawBinPath(): string {
  return resolve(getManagedOpenClawDir(), "node_modules", ".bin", "openclaw");
}

export function getManagedWechatInstallerDir(): string {
  return resolve(getDataDir(), "wechat-installer-runtime");
}

export function getAppRootDir(): string | undefined {
  return process.env.CHILLCLAW_APP_ROOT;
}

export function getStaticDir(): string | undefined {
  return process.env.CHILLCLAW_STATIC_DIR ?? (getAppRootDir() ? resolve(getAppRootDir()!, "app/ui") : undefined);
}

export function getBootstrapScriptPath(): string {
  return process.env.CHILLCLAW_OPENCLAW_BOOTSTRAP_SCRIPT ?? (getAppRootDir() ? resolve(getAppRootDir()!, "app/scripts/bootstrap-openclaw.mjs") : resolve(process.cwd(), "scripts/bootstrap-openclaw.mjs"));
}

export function getDefaultAppSupportDir(): string {
  return resolve(homedir(), "Library/Application Support/ChillClaw");
}

export function getLogDir(): string {
  return process.env.CHILLCLAW_LOG_DIR ?? (getAppRootDir() ? resolve(getDefaultAppSupportDir(), "logs") : resolve(getDataDir(), "logs"));
}

export function getScriptsDir(): string | undefined {
  return getAppRootDir() ? resolve(getAppRootDir()!, "app/scripts") : undefined;
}

export function getLaunchAgentLabel(): string {
  return process.env.CHILLCLAW_LAUNCHAGENT_LABEL ?? "ai.chillclaw.daemon";
}

export function getLaunchAgentPlistPath(): string {
  return resolve(homedir(), "Library/LaunchAgents", `${getLaunchAgentLabel()}.plist`);
}
