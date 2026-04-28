import { homedir } from "node:os";
import { resolve } from "node:path";

export function getDataDir(): string {
  return process.env.CHILLCLAW_DATA_DIR ?? resolve(process.cwd(), "apps/daemon/.data");
}

export function getManagedOpenClawDir(): string {
  return resolve(getDataDir(), "openclaw-runtime");
}

export function getManagedOpenClawHomeDir(): string {
  return resolve(getDataDir(), "openclaw-home");
}

export function getManagedOpenClawStateDir(): string {
  return resolve(getManagedOpenClawHomeDir(), ".openclaw");
}

export function getManagedOpenClawBinPath(): string {
  return resolve(getManagedOpenClawDir(), "node_modules", ".bin", "openclaw");
}

export function getManagedWechatInstallerDir(): string {
  return resolve(getDataDir(), "wechat-installer-runtime");
}

export function getManagedNodeVersion(): string {
  return process.env.CHILLCLAW_MANAGED_NODE_VERSION?.trim() || "24.15.0";
}

export function getManagedNodeDistName(): string {
  const arch = process.arch === "x64" ? "x64" : "arm64";
  return `node-v${getManagedNodeVersion()}-darwin-${arch}`;
}

export function getManagedNodeDir(): string {
  return resolve(getDataDir(), "node-runtime");
}

export function getManagedNodeInstallDir(): string {
  return resolve(getManagedNodeDir(), getManagedNodeDistName());
}

export function getManagedNodeBinDir(): string {
  return resolve(getManagedNodeInstallDir(), "bin");
}

export function getManagedNodeBinPath(): string {
  return resolve(getManagedNodeBinDir(), "node");
}

export function getManagedNodeNpmBinPath(): string {
  return resolve(getManagedNodeBinDir(), "npm");
}

export function getManagedOllamaDir(): string {
  return resolve(getDataDir(), "ollama-runtime");
}

export function getLegacyManagedOllamaAppPath(): string {
  return resolve(getManagedOllamaDir(), "Ollama.app");
}

export function getManagedOllamaBinDir(): string {
  return resolve(getManagedOllamaDir(), "bin");
}

export function getManagedOllamaCliPath(): string {
  return resolve(getManagedOllamaBinDir(), "ollama");
}

export function getManagedOllamaModelsDir(): string {
  return resolve(getManagedOllamaDir(), "models");
}

export function getRuntimeManagerStatePath(): string {
  return resolve(getDataDir(), "runtime-manager-state.json");
}

export function getDownloadManagerStatePath(): string {
  return resolve(getDataDir(), "download-manager-state.json");
}

export function getDownloadCacheDir(): string {
  return resolve(getDataDir(), "downloads", "cache");
}

export function getDownloadTempDir(): string {
  return resolve(getDataDir(), "downloads", "tmp");
}

export function getAppRootDir(): string | undefined {
  return process.env.CHILLCLAW_APP_ROOT;
}

export function getRuntimeBundleDir(): string | undefined {
  return process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR ?? (getAppRootDir() ? resolve(getAppRootDir()!, "app/runtime-artifacts") : undefined);
}

export function getRuntimeManifestPath(): string | undefined {
  return process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH ?? (getRuntimeBundleDir() ? resolve(getRuntimeBundleDir()!, "runtime-manifest.lock.json") : undefined);
}

export function getRuntimeUpdateFeedUrl(): string | undefined {
  return process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL?.trim() || undefined;
}

export function getStaticDir(): string | undefined {
  return process.env.CHILLCLAW_STATIC_DIR ?? (getAppRootDir() ? resolve(getAppRootDir()!, "app/ui") : undefined);
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
