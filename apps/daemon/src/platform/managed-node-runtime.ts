import { copyFile, cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getAppRootDir,
  getManagedNodeBinDir,
  getManagedNodeBinPath,
  getManagedNodeDir,
  getManagedNodeDistName,
  getManagedNodeInstallDir,
  getManagedNodeNpmBinPath,
} from "../runtime-paths.js";
import { errorToLogDetails, formatConsoleLine } from "../services/logger.js";
import { probeCommand, runCommand } from "./cli-runner.js";

export interface ManagedNodeInvocation {
  command: string;
  argsPrefix: string[];
  display: string;
}

export interface ManagedNodeInstallOptions {
  archiveUrl?: string;
  runtimeDir?: string;
}

function managedNodeArchiveUrl(options?: ManagedNodeInstallOptions): string | undefined {
  return options?.archiveUrl?.trim() || process.env.CHILLCLAW_MANAGED_NODE_DIST_URL?.trim() || undefined;
}

function getManagedNodeNpmCliPath(): string {
  return resolve(getManagedNodeInstallDir(), "lib", "node_modules", "npm", "bin", "npm-cli.js");
}

function shouldLogManagedNodeRuntime(): boolean {
  if (process.env.CHILLCLAW_LOG_RUNTIME_DIAGNOSTICS === "0") {
    return false;
  }

  return process.env.CHILLCLAW_LOG_RUNTIME_DIAGNOSTICS === "1" || Boolean(getAppRootDir());
}

function logManagedNodeRuntime(scope: string, message: string): void {
  if (!shouldLogManagedNodeRuntime()) {
    return;
  }

  console.log(formatConsoleLine(message, { scope: `managedNodeRuntime.${scope}` }));
}

function summarizeCommandOutput(output: string): string {
  const normalized = output.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 300) {
    return normalized;
  }

  return `${normalized.slice(0, 300)}...`;
}

function renderCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

async function probeManagedNodeCommand(label: string, command: string, args: string[]): Promise<boolean> {
  try {
    const result = await runCommand(command, args, {
      allowFailure: true,
      env: managedNodeEnv(command)
    });
    if (result.code === 0) {
      logManagedNodeRuntime(
        "probe",
        `${label} succeeded: ${renderCommand(command, args)}${result.stdout ? ` output=${summarizeCommandOutput(result.stdout)}` : ""}`
      );
      return true;
    }

    logManagedNodeRuntime(
      "probe",
      `${label} failed: ${renderCommand(command, args)} code=${result.code}` +
        `${result.signal ? ` signal=${result.signal}` : ""}` +
        `${result.stderr ? ` stderr=${summarizeCommandOutput(result.stderr)}` : ""}` +
        `${result.stdout ? ` stdout=${summarizeCommandOutput(result.stdout)}` : ""}`
    );
    return false;
  } catch (error) {
    logManagedNodeRuntime(
      "probe",
      `${label} failed to spawn: ${renderCommand(command, args)} details=${JSON.stringify(errorToLogDetails(error))}`
    );
    return false;
  }
}

function managedNodeEnv(command?: string): NodeJS.ProcessEnv {
  const pathEntries = [
    command && command.startsWith("/") ? dirname(command) : undefined,
    getManagedNodeBinDir(),
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ].filter((value): value is string => Boolean(value));

  return {
    ...process.env,
    PATH: [...new Set(pathEntries)].join(delimiter),
    NO_COLOR: "1"
  };
}

async function downloadArchive(url: string, destination: string): Promise<void> {
  if (url.startsWith("file://")) {
    await copyFile(fileURLToPath(url), destination);
    return;
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    await copyFile(url, destination);
    return;
  }

  throw new Error("ChillClaw requires DownloadManager to fetch the managed Node.js runtime archive before installation.");
}

async function extractArchive(archivePath: string, destinationDir: string): Promise<void> {
  const result = await runCommand("/usr/bin/tar", ["-xf", archivePath, "-C", destinationDir], {
    allowFailure: true,
    env: managedNodeEnv()
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "ChillClaw could not extract the managed Node.js runtime.");
  }
}

async function probeManagedNpm(command: string): Promise<boolean> {
  return probeManagedNodeCommand("npm shim", command, ["--version"]);
}

async function installManagedNodeRuntime(options?: ManagedNodeInstallOptions): Promise<void> {
  const workspace = await mkdtemp(resolve(tmpdir(), "chillclaw-node-runtime-"));
  const archivePath = resolve(workspace, `${getManagedNodeDistName()}.tar.xz`);
  const extractedPath = resolve(workspace, getManagedNodeDistName());
  const installPath = getManagedNodeInstallDir();

  try {
    await mkdir(getManagedNodeDir(), { recursive: true });
    if (options?.runtimeDir) {
      logManagedNodeRuntime(
        "install",
        `copying bundled Node.js runtime from ${options.runtimeDir} to ${installPath} via ${workspace}`
      );
      await cp(options.runtimeDir, extractedPath, { recursive: true, force: true, verbatimSymlinks: true });
    } else {
      const archiveUrl = managedNodeArchiveUrl(options);
      if (!archiveUrl) {
        throw new Error(
          "ChillClaw could not find its packaged Node.js runtime archive. Rebuild the installer after running npm run prepare:runtime-artifacts."
        );
      }
      logManagedNodeRuntime("install", `installing Node.js runtime from archive into ${installPath}`);
      await downloadArchive(archiveUrl, archivePath);
      await extractArchive(archivePath, workspace);
    }
    await rm(installPath, { recursive: true, force: true });
    await rename(extractedPath, installPath);
    logManagedNodeRuntime("install", `installed Node.js runtime at ${installPath}`);
  } catch (error) {
    logManagedNodeRuntime(
      "install",
      `failed to install Node.js runtime at ${installPath}: ${JSON.stringify(errorToLogDetails(error))}`
    );
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function resolveManagedNodeNpmInvocation(): Promise<ManagedNodeInvocation | undefined> {
  const npmPath = getManagedNodeNpmBinPath();

  if (await probeManagedNpm(npmPath)) {
    return {
      command: npmPath,
      argsPrefix: [],
      display: npmPath
    };
  }

  const nodePath = getManagedNodeBinPath();
  const npmCliPath = getManagedNodeNpmCliPath();
  if (await probeManagedNodeCommand("npm cli via node", nodePath, [npmCliPath, "--version"])) {
    return {
      command: nodePath,
      argsPrefix: [npmCliPath],
      display: `${nodePath} ${npmCliPath}`
    };
  }

  return undefined;
}

export async function ensureManagedNodeNpmInvocation(options?: ManagedNodeInstallOptions): Promise<ManagedNodeInvocation> {
  const existing = await resolveManagedNodeNpmInvocation();
  if (existing) {
    logManagedNodeRuntime("resolve", `using existing managed Node/npm invocation: ${existing.display}`);
    return existing;
  }

  if (process.platform !== "darwin") {
    throw new Error("ChillClaw can only install the managed Node.js runtime automatically on macOS.");
  }

  if (process.arch !== "arm64" && process.arch !== "x64") {
    throw new Error(`ChillClaw does not have a managed Node.js runtime for ${process.arch} Macs.`);
  }

  const installPath = getManagedNodeInstallDir();

  logManagedNodeRuntime(
    "install",
    `no runnable managed npm found; installing Node.js runtime dist=${getManagedNodeDistName()} platform=${process.platform} arch=${process.arch}`
  );
  await installManagedNodeRuntime(options);
  let invocation = await resolveManagedNodeNpmInvocation();

  if (!invocation && options?.runtimeDir) {
    const archiveUrl = managedNodeArchiveUrl(options);
    if (!archiveUrl) {
      throw new Error(
        "ChillClaw's bundled Node.js runtime is not runnable. Rebuild the installer after running npm run prepare:runtime-artifacts."
      );
    }
    logManagedNodeRuntime("install", "bundled Node.js runtime was not runnable; trying configured archive fallback");
    await installManagedNodeRuntime({ archiveUrl });
    invocation = await resolveManagedNodeNpmInvocation();
  }

  if (!invocation) {
    throw new Error(`ChillClaw installed Node.js into ${installPath}, but npm is not executable.`);
  }

  if (!(await probeCommand(getManagedNodeBinPath(), ["--version"], { env: managedNodeEnv(getManagedNodeBinPath()) }))) {
    throw new Error(`ChillClaw installed Node.js into ${installPath}, but node is not executable.`);
  }

  logManagedNodeRuntime("resolve", `resolved managed Node/npm invocation: ${invocation.display}`);
  return invocation;
}
