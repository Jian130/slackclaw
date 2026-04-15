import { copyFile, cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getManagedNodeBinDir,
  getManagedNodeBinPath,
  getManagedNodeDir,
  getManagedNodeDistName,
  getManagedNodeInstallDir,
  getManagedNodeNpmBinPath,
  getManagedNodeVersion
} from "../runtime-paths.js";
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

function managedNodeArchiveUrl(options?: ManagedNodeInstallOptions): string {
  return options?.archiveUrl?.trim() || process.env.CHILLCLAW_MANAGED_NODE_DIST_URL?.trim() || `https://nodejs.org/dist/v${getManagedNodeVersion()}/${getManagedNodeDistName()}.tar.gz`;
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
  const result = await runCommand("/usr/bin/tar", ["-xzf", archivePath, "-C", destinationDir], {
    allowFailure: true,
    env: managedNodeEnv()
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "ChillClaw could not extract the managed Node.js runtime.");
  }
}

async function probeManagedNpm(command: string): Promise<boolean> {
  return probeCommand(command, ["--version"], {
    env: managedNodeEnv(command)
  });
}

async function installManagedNodeRuntime(options?: ManagedNodeInstallOptions): Promise<void> {
  const workspace = await mkdtemp(resolve(tmpdir(), "chillclaw-node-runtime-"));
  const archivePath = resolve(workspace, `${getManagedNodeDistName()}.tar.gz`);
  const extractedPath = resolve(workspace, getManagedNodeDistName());
  const installPath = getManagedNodeInstallDir();

  try {
    await mkdir(getManagedNodeDir(), { recursive: true });
    if (options?.runtimeDir) {
      await cp(options.runtimeDir, extractedPath, { recursive: true, force: true, verbatimSymlinks: true });
    } else {
      await downloadArchive(managedNodeArchiveUrl(options), archivePath);
      await extractArchive(archivePath, workspace);
    }
    await rm(installPath, { recursive: true, force: true });
    await rename(extractedPath, installPath);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function resolveManagedNodeNpmInvocation(): Promise<ManagedNodeInvocation | undefined> {
  const npmPath = getManagedNodeNpmBinPath();

  if (!(await probeManagedNpm(npmPath))) {
    return undefined;
  }

  return {
    command: npmPath,
    argsPrefix: [],
    display: npmPath
  };
}

export async function ensureManagedNodeNpmInvocation(options?: ManagedNodeInstallOptions): Promise<ManagedNodeInvocation> {
  const existing = await resolveManagedNodeNpmInvocation();
  if (existing) {
    return existing;
  }

  if (process.platform !== "darwin") {
    throw new Error("ChillClaw can only install the managed Node.js runtime automatically on macOS.");
  }

  if (process.arch !== "arm64" && process.arch !== "x64") {
    throw new Error(`ChillClaw does not have a managed Node.js runtime for ${process.arch} Macs.`);
  }

  const installPath = getManagedNodeInstallDir();

  await installManagedNodeRuntime(options);
  let invocation = await resolveManagedNodeNpmInvocation();

  if (!invocation && options?.runtimeDir) {
    await installManagedNodeRuntime({ archiveUrl: options.archiveUrl });
    invocation = await resolveManagedNodeNpmInvocation();
  }

  if (!invocation) {
    throw new Error(`ChillClaw installed Node.js into ${installPath}, but npm is not executable.`);
  }

  if (!(await probeCommand(getManagedNodeBinPath(), ["--version"], { env: managedNodeEnv(getManagedNodeBinPath()) }))) {
    throw new Error(`ChillClaw installed Node.js into ${installPath}, but node is not executable.`);
  }

  return invocation;
}
