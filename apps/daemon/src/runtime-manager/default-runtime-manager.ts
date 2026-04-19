import { constants } from "node:fs";
import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { RuntimeSourcePolicy } from "@chillclaw/contracts";

import { ensureManagedNodeNpmInvocation, resolveManagedNodeNpmInvocation } from "../platform/managed-node-runtime.js";
import { probeCommand, runCommand } from "../platform/cli-runner.js";
import {
  getManagedNodeBinDir,
  getManagedNodeBinPath,
  getManagedNodeDir,
  getManagedNodeDistName,
  getManagedNodeNpmBinPath,
  getManagedNodeVersion,
  getLegacyManagedOllamaAppPath,
  getManagedOllamaBinDir,
  getManagedOllamaCliPath,
  getManagedOllamaDir,
  getManagedOllamaModelsDir,
  getManagedOpenClawBinPath,
  getManagedOpenClawDir,
  getRuntimeBundleDir,
  getRuntimeManagerStatePath,
  getRuntimeManifestPath,
  getRuntimeUpdateFeedUrl
} from "../runtime-paths.js";
import { logDevelopmentCommand, writeInfoLog } from "../services/logger.js";
import type { EventPublisher } from "../services/event-publisher.js";
import type { DownloadManager } from "../download-manager/download-manager.js";
import { getProductVersion } from "../product-version.js";
import { RuntimeManager } from "./runtime-manager.js";
import type {
  RuntimeArtifactManifest,
  RuntimeManifestDocument,
  RuntimeManagerState,
  RuntimeResourceManifest,
  RuntimeResourceProvider
} from "./types.js";

const DEFAULT_OPENCLAW_VERSION = process.env.CHILLCLAW_MANAGED_OPENCLAW_VERSION?.trim() || "2026.4.15";
const DEFAULT_OLLAMA_VERSION = process.env.CHILLCLAW_MANAGED_OLLAMA_VERSION?.trim() || "0.20.6";
const DEFAULT_OLLAMA_CLI_ARCHIVE_NAME = "ollama-darwin.tgz";
const PACKAGED_NODE_MODULES_PRUNE_DIRS = new Set([".github", ".husky", ".nyc_output", "__tests__", "coverage", "test", "tests"]);

export function createRuntimeManager(eventPublisher?: EventPublisher, downloadManager?: DownloadManager): RuntimeManager {
  return new RuntimeManager({
    loadManifest: loadPackagedRuntimeManifest,
    loadUpdateManifest: loadRuntimeUpdateManifest,
    getAppVersion: getProductVersion,
    readState: readRuntimeManagerState,
    writeState: writeRuntimeManagerState,
    providers: [
      createNodeRuntimeProvider(),
      createOpenClawRuntimeProvider(),
      createOllamaRuntimeProvider(),
      createLocalModelCatalogProvider()
    ],
    downloadArtifact: downloadManager
      ? ({ resource, artifact }) => downloadRuntimeArtifact(downloadManager, resource, artifact)
      : undefined,
    publishProgress: (args) => eventPublisher?.publishRuntimeProgress(args),
    publishCompleted: (args) => eventPublisher?.publishRuntimeCompleted(args),
    publishUpdateStaged: (args) => eventPublisher?.publishRuntimeUpdateStaged(args)
  });
}

async function downloadRuntimeArtifact(
  downloadManager: DownloadManager,
  resource: RuntimeResourceManifest,
  artifact: RuntimeArtifactManifest
): Promise<{ artifact: RuntimeArtifactManifest; jobId?: string }> {
  if (!artifact.url) {
    return { artifact };
  }

  const source = artifact.url.startsWith("file://")
    ? { kind: "file" as const, path: fileURLToPath(artifact.url) }
    : { kind: "http" as const, url: artifact.url };
  const fileName = `${safeRuntimeFileName(resource.id)}-${safeRuntimeFileName(resource.version)}-${downloadFileName(artifact.url)}`;
  const job = await downloadManager.enqueue({
    type: "runtime",
    artifactId: String(resource.id),
    displayName: resource.label,
    version: resource.version,
    source,
    expectedBytes: artifact.sizeBytes,
    requiredBytes: artifact.sizeBytes,
    checksum: artifact.sha256,
    priority: 10,
    silent: true,
    requester: "runtime-manager",
    dedupeKey: `runtime:${resource.id}:${resource.version}:${artifact.url}`,
    destinationPolicy: {
      baseDir: "cache",
      fileName
    },
    metadata: {
      format: artifact.format,
      installDir: resource.installDir
    }
  });
  const completed = await downloadManager.waitForJob(job.id);
  if (completed.status !== "completed") {
    throw new Error(completed.error?.message ?? `${resource.label} download did not complete.`);
  }

  return {
    artifact: {
      ...artifact,
      path: completed.destinationPath
    },
    jobId: completed.id
  };
}

function downloadFileName(url: string): string {
  try {
    return safeRuntimeFileName(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "artifact");
  } catch {
    return "artifact";
  }
}

function safeRuntimeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact";
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function loadPackagedRuntimeManifest(): Promise<RuntimeManifestDocument> {
  const manifestPath = getRuntimeManifestPath();
  if (!manifestPath) {
    return defaultRuntimeManifest();
  }

  try {
    return resolvePackagedRuntimeManifestForCurrentPlatform(
      JSON.parse(await readFile(manifestPath, "utf8")) as RuntimeManifestDocument,
      dirname(manifestPath)
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultRuntimeManifest();
    }
    throw error;
  }
}

export function resolvePackagedRuntimeManifestForCurrentPlatform(
  document: RuntimeManifestDocument,
  baseDir: string,
  platform: { platform: NodeJS.Platform; arch: NodeJS.Architecture } = {
    platform: process.platform,
    arch: process.arch
  }
): RuntimeManifestDocument {
  return {
    ...document,
    resources: document.resources.map((resource) => {
      if (resource.id === "node-npm-runtime" && platform.platform === "darwin") {
        const distName = managedNodeDistNameFor(resource.version, platform.arch);
        return {
          ...resource,
          platforms: [
            {
              os: "darwin" as const,
              arch: managedNodeArch(platform.arch)
            }
          ],
          activePath: `node-runtime/${distName}/bin/npm`,
          artifacts: resource.artifacts.map((artifact) => ({
            ...artifact,
            path: artifact.source === "bundled" && artifact.format === "directory"
              ? resolve(baseDir, "node", distName)
              : artifact.path && !isAbsolute(artifact.path)
                ? resolve(baseDir, artifact.path)
                : artifact.path
          }))
        };
      }

      return {
        ...resource,
        artifacts: resource.artifacts.map((artifact) => ({
          ...artifact,
          path: artifact.path && !isAbsolute(artifact.path) ? resolve(baseDir, artifact.path) : artifact.path
        }))
      };
    })
  };
}

function managedNodeDistNameFor(version: string, arch: NodeJS.Architecture): string {
  return `node-v${version}-darwin-${managedNodeArch(arch)}`;
}

function managedNodeArch(arch: NodeJS.Architecture): "arm64" | "x64" {
  return arch === "x64" ? "x64" : "arm64";
}

async function loadRuntimeUpdateManifest(): Promise<RuntimeManifestDocument> {
  const feedUrl = getRuntimeUpdateFeedUrl();
  if (!feedUrl) {
    return {
      resources: []
    };
  }

  if (feedUrl.startsWith("http://") || feedUrl.startsWith("https://")) {
    try {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        await writeInfoLog(
          "Runtime update feed is unavailable; continuing with the bundled runtime manifest.",
          {
            feedUrl,
            status: response.status
          },
          {
            scope: "runtimeManager.updateFeed"
          }
        );
        return {
          resources: []
        };
      }
      return (await response.json()) as RuntimeManifestDocument;
    } catch (error) {
      await writeInfoLog(
        "Runtime update feed could not be read; continuing with the bundled runtime manifest.",
        {
          feedUrl,
          error: error instanceof Error ? error.message : String(error)
        },
        {
          scope: "runtimeManager.updateFeed"
        }
      );
      return {
        resources: []
      };
    }
  }

  const path = feedUrl.startsWith("file://") ? fileURLToPath(feedUrl) : feedUrl;
  return JSON.parse(await readFile(path, "utf8")) as RuntimeManifestDocument;
}

async function readRuntimeManagerState(): Promise<RuntimeManagerState | undefined> {
  try {
    return JSON.parse(await readFile(getRuntimeManagerStatePath(), "utf8")) as RuntimeManagerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeRuntimeManagerState(state: RuntimeManagerState): Promise<void> {
  const statePath = getRuntimeManagerStatePath();
  await mkdir(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2));
  await rename(tempPath, statePath);
}

function defaultRuntimeManifest(): RuntimeManifestDocument {
  const bundleDir = getRuntimeBundleDir();
  const nodeArchiveName = `${getManagedNodeDistName()}.tar.gz`;
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    generatedAt: now,
    resources: [
      {
        id: "node-npm-runtime",
        kind: "node-npm",
        label: "Node.js and npm runtime",
        version: getManagedNodeVersion(),
        platforms: [
          {
            os: "darwin",
            arch: process.arch === "x64" ? "x64" : "arm64"
          }
        ],
        sourcePolicy: ["bundled", "download"],
        updatePolicy: "stage-silently-apply-safely",
        installDir: getManagedNodeDir(),
        activePath: getManagedNodeNpmBinPath(),
        artifacts: [
          ...(bundleDir
            ? [
                {
                  source: "bundled" as const,
                  format: "directory" as const,
                  path: resolve(bundleDir, "node", getManagedNodeDistName())
                }
              ]
            : []),
          {
            source: "download",
            format: "tgz",
            url: `https://nodejs.org/dist/v${getManagedNodeVersion()}/${nodeArchiveName}`
          }
        ],
        dependencies: []
      },
      {
        id: "openclaw-runtime",
        kind: "engine",
        label: "OpenClaw runtime",
        version: DEFAULT_OPENCLAW_VERSION,
        platforms: [
          {
            os: "darwin",
            arch: "*"
          }
        ],
        sourcePolicy: ["bundled"],
        updatePolicy: "stage-silently-apply-safely",
        installDir: getManagedOpenClawDir(),
        activePath: getManagedOpenClawBinPath(),
        artifacts: bundleDir
          ? [
              {
                source: "bundled",
                format: "directory",
                path: resolve(bundleDir, "openclaw", "openclaw-runtime")
              }
            ]
          : [],
        dependencies: ["node-npm-runtime"]
      },
      {
        id: "ollama-runtime",
        kind: "local-ai-runtime",
        label: "Ollama runtime",
        version: DEFAULT_OLLAMA_VERSION,
        platforms: [
          {
            os: "darwin",
            arch: "arm64"
          }
        ],
        sourcePolicy: ["bundled", "download"],
        updatePolicy: "stage-silently-apply-safely",
        installDir: getManagedOllamaDir(),
        activePath: getManagedOllamaCliPath(),
        artifacts: [
          ...(bundleDir
            ? [
                {
                  source: "bundled" as const,
                  format: "file" as const,
                  path: resolve(bundleDir, "ollama", "ollama")
                }
              ]
            : []),
          {
            source: "download",
            format: "tgz",
            url: defaultOllamaCliArchiveUrl(DEFAULT_OLLAMA_VERSION)
          }
        ],
        dependencies: []
      },
      {
        id: "local-model-catalog",
        kind: "model-catalog",
        label: "Local model catalog",
        version: "2026.04.13",
        platforms: [
          {
            os: "*",
            arch: "*"
          }
        ],
        sourcePolicy: ["bundled", "download"],
        updatePolicy: "stage-silently-apply-safely",
        installDir: getManagedOllamaDir(),
        artifacts: bundleDir
          ? [
              {
                source: "bundled",
                format: "json",
                path: resolve(bundleDir, "models", "local-model-catalog.json")
              }
            ]
          : [],
        dependencies: []
      }
    ]
  };
}

function createNodeRuntimeProvider(): RuntimeResourceProvider {
  return {
    id: "node-npm-runtime",
    async inspect() {
      const invocation = await resolveManagedNodeNpmInvocation();
      const nodeReady = invocation
        ? await probeCommand(getManagedNodeBinPath(), ["--version"])
        : false;
      return {
        installed: Boolean(invocation),
        ready: Boolean(invocation && nodeReady),
        version: invocation ? await probeVersion(getManagedNodeBinPath(), ["--version"]) : undefined,
        activePath: invocation?.command,
        summary: invocation && nodeReady ? "Node.js and npm are ready." : "Node.js and npm are not prepared yet.",
        detail: invocation && nodeReady
          ? "ChillClaw verified the managed Node.js and npm binaries."
          : "ChillClaw will prepare its managed Node.js and npm runtime before installing OpenClaw."
      };
    },
    async prepare(context) {
      const runtimeDir = context.source === "bundled" && context.artifact?.format === "directory"
        ? context.artifact.path
        : undefined;
      const archiveUrl = context.artifact?.path && context.artifact.format !== "directory"
        ? pathToFileURL(context.artifact.path).toString()
        : context.artifact?.url;
      const invocation = await ensureManagedNodeNpmInvocation({
        archiveUrl,
        runtimeDir
      });
      const nodeVersion = await probeVersion(getManagedNodeBinPath(), ["--version"]);
      const npmVersion = await probeVersion(
        invocation.command,
        [...invocation.argsPrefix, "--version"],
        managedNodeEnv(invocation.command)
      );
      return {
        version: nodeVersion?.replace(/^v/, "") ?? context.manifest.version,
        activePath: invocation.command,
        changed: true,
        summary: "Node.js and npm are ready.",
        detail: `ChillClaw verified Node.js ${nodeVersion ?? context.manifest.version} and npm ${npmVersion ?? "available"}.`
      };
    },
    async applyUpdate(context) {
      return this.prepare({
        manifest: context.staged,
        source: providerSourceFor(context.staged, context.state?.source),
        artifact: providerArtifactFor(context.staged, context.state?.source),
        state: context.state
      });
    },
    async rollback(context) {
      if (!context.previousVersion) {
        return {
          changed: false,
          summary: "No previous Node.js runtime was recorded.",
          detail: "ChillClaw did not find a previous managed Node.js runtime to restore."
        };
      }
      return {
        version: context.previousVersion,
        activePath: getManagedNodeNpmBinPath(),
        changed: false,
        summary: "Node.js rollback recorded.",
        detail: "ChillClaw restored the previous Node.js runtime pointer."
      };
    },
    async remove() {
      await rm(getManagedNodeDir(), { recursive: true, force: true });
      return {
        changed: true,
        summary: "Node.js runtime removed.",
        detail: "ChillClaw removed the managed Node.js runtime."
      };
    }
  };
}

function createOpenClawRuntimeProvider(): RuntimeResourceProvider {
  return {
    id: "openclaw-runtime",
    async inspect() {
      const ready = await probeCommand(getManagedOpenClawBinPath(), ["--version"], {
        env: managedNodeEnv(getManagedOpenClawBinPath())
      });
      return {
        installed: ready,
        ready,
        version: ready ? await probeVersion(getManagedOpenClawBinPath(), ["--version"], managedNodeEnv(getManagedOpenClawBinPath())) : undefined,
        activePath: ready ? getManagedOpenClawBinPath() : undefined,
        summary: ready ? "OpenClaw runtime is ready." : "OpenClaw runtime is not installed yet.",
        detail: ready
          ? "ChillClaw verified the managed OpenClaw CLI."
          : "ChillClaw will install the managed OpenClaw runtime through its pinned Node.js and npm runtime."
      };
    },
    async prepare(context) {
      await installOpenClawFromArtifact(context.manifest, context.artifact);
      const version = await probeVersion(getManagedOpenClawBinPath(), ["--version"], managedNodeEnv(getManagedOpenClawBinPath()));
      return {
        version: version ?? context.manifest.version,
        activePath: getManagedOpenClawBinPath(),
        changed: true,
        summary: "OpenClaw runtime is ready.",
        detail: "ChillClaw installed and verified the managed OpenClaw runtime."
      };
    },
    async applyUpdate(context) {
      return this.prepare({
        manifest: context.staged,
        source: providerSourceFor(context.staged, context.state?.source),
        artifact: providerArtifactFor(context.staged, context.state?.source),
        state: context.state
      });
    },
    async rollback(context) {
      if (!context.previousVersion) {
        return {
          changed: false,
          summary: "No previous OpenClaw runtime was recorded.",
          detail: "ChillClaw did not find a previous managed OpenClaw runtime to restore."
        };
      }
      return {
        version: context.previousVersion,
        activePath: getManagedOpenClawBinPath(),
        changed: false,
        summary: "OpenClaw rollback recorded.",
        detail: "Bundled OpenClaw runtime replacement restores the previous runtime during failed installs before recording rollback state."
      };
    },
    async remove() {
      await rm(getManagedOpenClawDir(), { recursive: true, force: true });
      return {
        changed: true,
        summary: "OpenClaw runtime removed.",
        detail: "ChillClaw removed the managed OpenClaw runtime."
      };
    }
  };
}

async function installOpenClawFromArtifact(
  manifest: RuntimeResourceManifest,
  artifact: RuntimeArtifactManifest | undefined
): Promise<void> {
  if (artifact?.path && artifact.format === "directory") {
    await installOpenClawFromDirectory(manifest, artifact.path);
  } else if (artifact?.format === "npm-package") {
    await installOpenClawFromNpmPackage(manifest, artifact);
  } else {
    throw new Error(`${manifest.label} requires a bundled OpenClaw runtime artifact.`);
  }

  if (!(await probeCommand(getManagedOpenClawBinPath(), ["--version"], { env: managedNodeEnv(getManagedOpenClawBinPath()) }))) {
    throw new Error(`${manifest.label} installed, but the managed OpenClaw command is not executable.`);
  }
}

async function installOpenClawFromDirectory(manifest: RuntimeResourceManifest, sourceDir: string): Promise<void> {
  const sourceBin = resolve(sourceDir, "node_modules", ".bin", "openclaw");
  await access(sourceBin, constants.X_OK);

  const workspace = await mkdtemp(resolve(tmpdir(), "chillclaw-openclaw-runtime-"));
  const nextDir = resolve(workspace, "openclaw-runtime");
  const backupDir = resolve(workspace, "previous-openclaw-runtime");
  let backedUpCurrentRuntime = false;
  try {
    await writeInfoLog("Installing OpenClaw runtime from bundled installer artifact.", {
      sourceDir,
      installDir: getManagedOpenClawDir()
    }, {
      scope: "runtimeManager.openclaw.installBundle"
    });
    await cp(sourceDir, nextDir, { recursive: true, force: true, verbatimSymlinks: true });
    if (await pathExists(getManagedOpenClawDir())) {
      await rename(getManagedOpenClawDir(), backupDir);
      backedUpCurrentRuntime = true;
    }
    await mkdir(dirname(getManagedOpenClawDir()), { recursive: true });
    await rename(nextDir, getManagedOpenClawDir());
    if (!(await probeCommand(getManagedOpenClawBinPath(), ["--version"], { env: managedNodeEnv(getManagedOpenClawBinPath()) }))) {
      throw new Error(`${manifest.label} installed, but the managed OpenClaw command is not executable.`);
    }
    await writeInfoLog("Installed bundled OpenClaw runtime.", {
      installDir: getManagedOpenClawDir()
    }, {
      scope: "runtimeManager.openclaw.installBundle"
    });
  } catch (error) {
    if (backedUpCurrentRuntime) {
      await rm(getManagedOpenClawDir(), { recursive: true, force: true });
      await rename(backupDir, getManagedOpenClawDir()).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function openClawNpmPackageSpec(
  manifest: RuntimeResourceManifest,
  artifact: RuntimeArtifactManifest
): { packageSpec: string; expectedVersion: string } {
  const packageName = artifact.package?.trim() || "openclaw";
  const expectedVersion = artifact.version?.trim() || manifest.version?.trim();

  if (packageName !== "openclaw") {
    throw new Error(`${manifest.label} npm-package artifacts must install the openclaw package.`);
  }

  if (!expectedVersion || expectedVersion === "latest") {
    throw new Error(`${manifest.label} npm-package artifacts must pin a concrete OpenClaw version.`);
  }

  return {
    packageSpec: `${packageName}@${expectedVersion}`,
    expectedVersion
  };
}

async function installOpenClawFromNpmPackage(
  manifest: RuntimeResourceManifest,
  artifact: RuntimeArtifactManifest
): Promise<void> {
  const { packageSpec, expectedVersion } = openClawNpmPackageSpec(manifest, artifact);
  const invocation = await ensureManagedNodeNpmInvocation();
  const workspace = await mkdtemp(resolve(tmpdir(), "chillclaw-openclaw-runtime-"));
  const nextDir = resolve(workspace, "openclaw-runtime");
  const nextBin = resolve(nextDir, "node_modules", ".bin", "openclaw");
  const backupDir = resolve(workspace, "previous-openclaw-runtime");
  let backedUpCurrentRuntime = false;

  try {
    await mkdir(nextDir, { recursive: true });
    await writeInfoLog("Installing OpenClaw runtime from approved npm package artifact.", {
      packageSpec,
      installDir: getManagedOpenClawDir()
    }, {
      scope: "runtimeManager.openclaw.installNpmPackage"
    });
    await installPackedOpenClawRuntime(nextDir, packageSpec, invocation, workspace, manifest);

    await access(nextBin, constants.X_OK);
    const version = await probeVersion(nextBin, ["--version"], managedNodeEnv(nextBin));
    if (version !== expectedVersion) {
      throw new Error(`${manifest.label} installed ${version ?? "an unknown version"}, expected ${expectedVersion}.`);
    }

    if (await pathExists(getManagedOpenClawDir())) {
      await rename(getManagedOpenClawDir(), backupDir);
      backedUpCurrentRuntime = true;
    }
    await mkdir(dirname(getManagedOpenClawDir()), { recursive: true });
    await rename(nextDir, getManagedOpenClawDir());
    if (!(await probeCommand(getManagedOpenClawBinPath(), ["--version"], { env: managedNodeEnv(getManagedOpenClawBinPath()) }))) {
      throw new Error(`${manifest.label} installed, but the managed OpenClaw command is not executable.`);
    }
    await writeInfoLog("Installed approved OpenClaw npm package runtime.", {
      packageSpec,
      installDir: getManagedOpenClawDir()
    }, {
      scope: "runtimeManager.openclaw.installNpmPackage"
    });
  } catch (error) {
    if (backedUpCurrentRuntime) {
      await rm(getManagedOpenClawDir(), { recursive: true, force: true });
      await rename(backupDir, getManagedOpenClawDir()).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function installPackedOpenClawRuntime(
  runtimeDir: string,
  packageSpec: string,
  invocation: { command: string; argsPrefix: string[] },
  workspace: string,
  manifest: RuntimeResourceManifest
): Promise<void> {
  const packageRoot = resolve(runtimeDir, "node_modules", "openclaw");
  const packArgs = [
    ...invocation.argsPrefix,
    "pack",
    packageSpec,
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    workspace
  ];
  const packResult = await runCommand(invocation.command, packArgs, {
    allowFailure: true,
    env: managedNodeEnv(invocation.command)
  });

  if (packResult.code !== 0) {
    throw new Error(packResult.stderr || packResult.stdout || `${manifest.label} npm pack failed.`);
  }

  const archiveName = parseNpmPackArchiveName(packResult.stdout);
  const archivePath = resolve(workspace, basename(archiveName));
  const extractResult = await runCommand("/usr/bin/tar", ["-xzf", archivePath, "-C", workspace], {
    allowFailure: true,
    env: managedNodeEnv()
  });

  if (extractResult.code !== 0) {
    throw new Error(extractResult.stderr || extractResult.stdout || `${manifest.label} package extraction failed.`);
  }

  await mkdir(dirname(packageRoot), { recursive: true });
  await rename(resolve(workspace, "package"), packageRoot);

  const installArgs = [
    ...invocation.argsPrefix,
    "install",
    "--prefix",
    packageRoot,
    "--omit=dev",
    "--package-lock=false",
    "--legacy-peer-deps"
  ];
  const installResult = await runCommand(invocation.command, installArgs, {
    allowFailure: true,
    env: managedNodeEnv(invocation.command)
  });

  if (installResult.code !== 0) {
    throw new Error(installResult.stderr || installResult.stdout || `${manifest.label} npm install failed.`);
  }

  await prunePackagedNodeModules(packageRoot);
  await createOpenClawBinShim(runtimeDir);
}

function parseNpmPackArchiveName(output: string): string {
  const parsed = JSON.parse(output);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const filename = entries.find((entry) => typeof entry?.filename === "string")?.filename;
  if (!filename) {
    throw new Error("npm pack did not report a package archive filename.");
  }
  return filename;
}

async function createOpenClawBinShim(runtimeDir: string): Promise<void> {
  const binDir = resolve(runtimeDir, "node_modules", ".bin");
  const openclawEntry = resolve(runtimeDir, "node_modules", "openclaw", "openclaw.mjs");
  const openclawBin = resolve(binDir, "openclaw");

  await mkdir(binDir, { recursive: true });
  await chmod(openclawEntry, 0o755);
  await rm(openclawBin, { force: true });
  await symlink("../openclaw/openclaw.mjs", openclawBin);
}

async function prunePackagedNodeModules(packageRoot: string): Promise<void> {
  await prunePackagedNodeModulesDir(resolve(packageRoot, "node_modules"));
}

async function prunePackagedNodeModulesDir(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = resolve(dir, entry.name);
    if (PACKAGED_NODE_MODULES_PRUNE_DIRS.has(entry.name)) {
      await rm(entryPath, { recursive: true, force: true });
      continue;
    }

    await prunePackagedNodeModulesDir(entryPath);
  }
}

function createOllamaRuntimeProvider(): RuntimeResourceProvider {
  return {
    id: "ollama-runtime",
    async inspect() {
      const ready = await probeCommand(getManagedOllamaCliPath(), ["--version"], {
        env: ollamaEnv()
      });
      return {
        installed: ready,
        ready,
        version: ready ? await probeVersion(getManagedOllamaCliPath(), ["--version"], ollamaEnv()) : undefined,
        activePath: ready ? getManagedOllamaCliPath() : undefined,
        summary: ready ? "Ollama runtime is ready." : "Ollama runtime is not installed yet.",
        detail: ready
          ? "ChillClaw verified the managed Ollama command."
          : "ChillClaw will install the managed Ollama CLI without changing model weights."
      };
    },
    async prepare(context) {
      const artifact = context.artifact ?? providerArtifactFor(context.manifest);
      await installOllamaFromArtifact(context.manifest, context.source, artifact);
      return {
        version: await probeVersion(getManagedOllamaCliPath(), ["--version"], ollamaEnv()) ?? context.manifest.version,
        activePath: getManagedOllamaCliPath(),
        changed: true,
        summary: "Ollama runtime is ready.",
        detail: "ChillClaw installed and verified the managed Ollama runtime. Model files were preserved."
      };
    },
    async applyUpdate(context) {
      await installOllamaFromArtifact(
        context.staged,
        providerSourceFor(context.staged, context.state?.source),
        providerArtifactFor(context.staged, context.state?.source)
      );
      return {
        version: await probeVersion(getManagedOllamaCliPath(), ["--version"], ollamaEnv()) ?? context.staged.version,
        activePath: getManagedOllamaCliPath(),
        changed: true,
        summary: "Ollama runtime updated.",
        detail: "ChillClaw updated Ollama and preserved the managed model directory."
      };
    },
    async rollback(context) {
      return {
        version: context.previousVersion,
        activePath: getManagedOllamaCliPath(),
        changed: false,
        summary: "Ollama rollback recorded.",
        detail: "ChillClaw kept the managed model directory untouched."
      };
    },
    async remove() {
      await rm(getManagedOllamaBinDir(), { recursive: true, force: true });
      await rm(getLegacyManagedOllamaAppPath(), { recursive: true, force: true });
      return {
        changed: true,
        summary: "Ollama CLI removed.",
        detail: "ChillClaw removed the managed Ollama command and left model files in place."
      };
    }
  };
}

function createLocalModelCatalogProvider(): RuntimeResourceProvider {
  return {
    id: "local-model-catalog",
    async inspect({ manifest, state }) {
      const ready = state?.installedVersion === manifest.version && state.status === "ready";
      return {
        installed: ready,
        ready,
        version: state?.installedVersion,
        summary: ready ? "Local model catalog is ready." : "Local model catalog has not been prepared yet.",
        detail: "Catalog updates refresh metadata only. They never download model weights."
      };
    },
    async prepare(context) {
      return {
        version: context.manifest.version,
        changed: true,
        summary: "Local model catalog is ready.",
        detail: "ChillClaw prepared local model metadata without downloading model weights."
      };
    },
    async applyUpdate(context) {
      return {
        version: context.staged.version,
        changed: true,
        summary: "Local model catalog updated.",
        detail: "ChillClaw refreshed local model metadata only."
      };
    }
  };
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
  ].filter((entry): entry is string => Boolean(entry));

  return {
    ...process.env,
    PATH: [...new Set(pathEntries)].join(delimiter),
    NO_COLOR: "1"
  };
}

async function probeVersion(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string | undefined> {
  try {
    const result = await runCommand(command, args, {
      allowFailure: true,
      env
    });
    if (result.code !== 0) {
      return undefined;
    }
    return normalizeVersion(result.stdout || result.stderr);
  } catch {
    return undefined;
  }
}

function normalizeVersion(output: string): string | undefined {
  const trimmed = output.trim();
  const version = trimmed.match(/v?(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)/u)?.[1];
  return version ?? (trimmed.length ? trimmed : undefined);
}

function providerSourceFor(manifest: RuntimeResourceManifest, preferredSource?: RuntimeSourcePolicy): RuntimeSourcePolicy {
  return preferredSource ?? manifest.sourcePolicy[0] ?? "download";
}

function providerArtifactFor(
  manifest: RuntimeResourceManifest,
  preferredSource?: RuntimeSourcePolicy
): RuntimeArtifactManifest | undefined {
  return manifest.artifacts.find((artifact) => artifact.source === providerSourceFor(manifest, preferredSource)) ?? manifest.artifacts[0];
}

async function installOllamaFromArtifact(
  manifest: RuntimeResourceManifest,
  source: RuntimeSourcePolicy,
  artifact: RuntimeArtifactManifest | undefined
): Promise<void> {
  await mkdir(getManagedOllamaDir(), { recursive: true });
  await mkdir(getManagedOllamaBinDir(), { recursive: true });
  await mkdir(getManagedOllamaModelsDir(), { recursive: true });
  await rm(getLegacyManagedOllamaAppPath(), { recursive: true, force: true });

  const workspace = await mkdtemp(resolve(tmpdir(), "chillclaw-ollama-runtime-"));
  const archivePath = artifact?.path && artifact.format === "tgz"
    ? artifact.path
    : resolve(workspace, DEFAULT_OLLAMA_CLI_ARCHIVE_NAME);
  const extractedPath = resolve(workspace, "extracted");

  try {
    const cliPath = await resolveOllamaCliArtifact(source, artifact, archivePath, extractedPath);
    await writeInfoLog("Installing Ollama runtime from managed runtime artifact.", {
      source,
      artifactFormat: artifact?.format,
      artifactPath: artifact?.path,
      installDir: getManagedOllamaDir()
    }, {
      scope: "runtimeManager.ollama.install"
    });
    await copyOllamaCli(cliPath);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  if (!(await probeCommand(getManagedOllamaCliPath(), ["--version"], { env: ollamaEnv() }))) {
    throw new Error(`${manifest.label} installed, but the managed Ollama command is not executable.`);
  }
}

function ollamaEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OLLAMA_MODELS: getManagedOllamaModelsDir(),
    OLLAMA_HOST: "127.0.0.1:11434"
  };
}

async function resolveOllamaCliArtifact(
  source: RuntimeSourcePolicy,
  artifact: RuntimeArtifactManifest | undefined,
  archivePath: string,
  extractedPath: string
): Promise<string> {
  if (artifact?.path && artifact.format === "file") {
    return artifact.path;
  }

  if (artifact?.path && artifact.format === "directory") {
    return findOllamaCliInDirectory(artifact.path);
  }

  let sourceArchivePath = archivePath;
  await mkdir(dirname(archivePath), { recursive: true });
  if (artifact?.path && artifact.format === "tgz") {
    sourceArchivePath = artifact.path;
  } else {
    if (source === "bundled" && artifact?.path) {
      await copyFile(artifact.path, archivePath);
    } else {
      throw new Error("ChillClaw requires DownloadManager to fetch the managed Ollama archive before installation.");
    }
  }

  await mkdir(extractedPath, { recursive: true });
  await runCommand("/usr/bin/tar", ["-xzf", sourceArchivePath, "-C", extractedPath], {
    beforeSpawn: (command, args) => logDevelopmentCommand("runtimeManager.ollama.extract", command, args)
  });
  return findOllamaCliInDirectory(extractedPath);
}

async function findOllamaCliInDirectory(root: string): Promise<string> {
  const candidates = [
    resolve(root, "ollama"),
    resolve(root, "bin", "ollama"),
    resolve(root, "ollama-darwin", "ollama"),
    resolve(root, "ollama-darwin", "bin", "ollama")
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common CLI artifact layout.
    }
  }
  throw new Error(`Ollama CLI artifact did not contain an executable named ollama under ${root}.`);
}

async function copyOllamaCli(sourcePath: string): Promise<void> {
  const destination = getManagedOllamaCliPath();
  await mkdir(dirname(destination), { recursive: true });
  if (sourcePath === destination) {
    await chmod(destination, 0o755);
    return;
  }
  await rm(destination, { force: true });
  if (basename(sourcePath) === "ollama" && sourcePath !== destination) {
    await copyFile(sourcePath, destination);
  } else {
    await cp(sourcePath, destination, { force: true });
  }
  await chmod(destination, 0o755);
}

function defaultOllamaCliArchiveUrl(version: string): string {
  return `https://github.com/ollama/ollama/releases/download/v${version}/${DEFAULT_OLLAMA_CLI_ARCHIVE_NAME}`;
}
