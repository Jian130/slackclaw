import { homedir } from "node:os";
import { resolve } from "node:path";

export function getDataDir(): string {
  return process.env.SLACKCLAW_DATA_DIR ?? resolve(process.cwd(), "apps/daemon/.data");
}

export function getAppRootDir(): string | undefined {
  return process.env.SLACKCLAW_APP_ROOT;
}

export function getStaticDir(): string | undefined {
  return process.env.SLACKCLAW_STATIC_DIR ?? (getAppRootDir() ? resolve(getAppRootDir()!, "app/ui") : undefined);
}

export function getBootstrapScriptPath(): string {
  return process.env.SLACKCLAW_OPENCLAW_BOOTSTRAP_SCRIPT ?? (getAppRootDir() ? resolve(getAppRootDir()!, "app/scripts/bootstrap-openclaw.mjs") : resolve(process.cwd(), "scripts/bootstrap-openclaw.mjs"));
}

export function getDefaultAppSupportDir(): string {
  return resolve(homedir(), "Library/Application Support/SlackClaw");
}

export function getScriptsDir(): string | undefined {
  return getAppRootDir() ? resolve(getAppRootDir()!, "app/scripts") : undefined;
}

export function getLaunchAgentLabel(): string {
  return process.env.SLACKCLAW_LAUNCHAGENT_LABEL ?? "ai.slackclaw.daemon";
}

export function getLaunchAgentPlistPath(): string {
  return resolve(homedir(), "Library/LaunchAgents", `${getLaunchAgentLabel()}.plist`);
}
