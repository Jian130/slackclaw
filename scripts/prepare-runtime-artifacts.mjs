#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import { writeScriptLogLine } from "./logging.mjs";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "runtime-manifest.lock.json");
const ARTIFACT_ROOT = resolve(ROOT, "runtime-artifacts");
const LOCAL_MODEL_CATALOG_SOURCE = resolve(ROOT, "apps/daemon/src/config/local-model-runtime-catalog.json");
const CACHE_DIR = resolve(ROOT, "dist/runtime-artifact-downloads");
const SCRIPT_LABEL = "ChillClaw runtime artifacts";
const WECHAT_PLUGIN_PACKAGE = "@tencent-weixin/openclaw-weixin";
const PACKAGED_NODE_MODULES_PRUNE_DIRS = new Set([".github", ".husky", ".nyc_output", "__tests__", "coverage", "test", "tests"]);
const MAX_NODE_BINARY_BYTES = 100_000_000;
const SLIM_NODE_RUNTIME_PRUNE_PATHS = [
  "CHANGELOG.md",
  "README.md",
  "bin/corepack",
  "bin/npx",
  "include",
  "share",
  "lib/node_modules/corepack",
  "lib/node_modules/npm/docs",
  "lib/node_modules/npm/man"
];

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));

  const nodeRuntime = await prepareNodeRuntime(resourceFor(manifest, "node-npm-runtime"));
  await prepareOpenClawRuntime(resourceFor(manifest, "openclaw-runtime"), nodeRuntime);
  await preparePersonalWechatPlugin(resourceFor(manifest, "wechat-plugin-openclaw-weixin"), nodeRuntime);
  await prepareOllamaRuntime(resourceFor(manifest, "ollama-runtime"));
  await prepareLocalModelCatalog(resourceFor(manifest, "local-model-catalog"));
  await assertNoInstallerPayloads(ARTIFACT_ROOT);
}

function resourceFor(manifest, id) {
  const resource = manifest.resources?.find((candidate) => candidate.id === id);
  if (!resource) {
    throw new Error(`runtime-manifest.lock.json is missing ${id}.`);
  }
  return resource;
}

function bundledArtifact(resource, expectedFormat) {
  const artifact = resource.artifacts?.find((candidate) => candidate.source === "bundled");
  if (!artifact) {
    throw new Error(`${resource.id} is missing a bundled artifact entry.`);
  }
  if (artifact.format !== expectedFormat) {
    throw new Error(`${resource.id} must bundle a ${expectedFormat} artifact, got ${artifact.format}.`);
  }
  if (!artifact.path) {
    throw new Error(`${resource.id} bundled artifact is missing a path.`);
  }
  return artifact;
}

function downloadArtifact(resource) {
  const artifact = resource.artifacts?.find((candidate) => candidate.source === "download" && candidate.url);
  if (!artifact) {
    throw new Error(`${resource.id} is missing a download artifact used for release artifact preparation.`);
  }
  return artifact;
}

async function prepareNodeRuntime(resource) {
  bundledArtifact(resource, "directory");
  const runtime = nodeRuntimePaths(resource);
  if (await executable(runtime.nodeBin) && await executable(runtime.npmBin)) {
    if (await nodeRuntimeWithinSizeLimit(runtime.nodeBin)) {
      log(`Node.js runtime already prepared at ${runtime.targetDir}.`);
      return runtime;
    }
    log(`Existing Node.js runtime at ${runtime.targetDir} is too large; rebuilding slim runtime.`);
  }

  const archiveName = `${runtime.distName}.${nodeArchiveExtension()}`;
  const baseUrl = `https://nodejs.org/dist/v${resource.version}`;
  const archiveUrl = `${baseUrl}/${archiveName}`;
  const shasumsUrl = `${baseUrl}/SHASUMS256.txt`;
  const archivePath = resolve(CACHE_DIR, archiveName);

  await mkdir(CACHE_DIR, { recursive: true });
  await downloadFile(archiveUrl, archivePath);
  const expectedDigest = await nodeDigestForArchive(shasumsUrl, archiveName);
  await verifyDigest(archivePath, expectedDigest);

  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-node-runtime-"));
  try {
    await run("tar", ["-xf", archivePath, "-C", tempDir]);
    const extractedDir = join(tempDir, runtime.distName);
    await requireExecutablePath(join(extractedDir, "bin", "node"), "Downloaded Node.js archive node is not executable.");
    await requireExecutablePath(join(extractedDir, "bin", "npm"), "Downloaded Node.js archive npm is not executable.");
    await slimNodeRuntime(extractedDir);
    await requireExecutablePath(join(extractedDir, "bin", "node"), "Slimmed Node.js runtime node is not executable.");
    await requireExecutablePath(join(extractedDir, "bin", "npm"), "Slimmed Node.js runtime npm is not executable.");
    await assertNodeRuntimeSize(join(extractedDir, "bin", "node"));
    await rm(runtime.targetDir, { recursive: true, force: true });
    await mkdir(dirname(runtime.targetDir), { recursive: true });
    await rename(extractedDir, runtime.targetDir);
    log(`Prepared runnable Node.js runtime at ${runtime.targetDir}.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return runtime;
}

function nodeArchiveExtension() {
  return "tar.xz";
}

async function slimNodeRuntime(runtimeDir) {
  for (const relativePath of SLIM_NODE_RUNTIME_PRUNE_PATHS) {
    await rm(resolve(runtimeDir, relativePath), { recursive: true, force: true });
  }

  const nodeBin = resolve(runtimeDir, "bin", "node");
  await stripNodeRuntimeBinary(nodeBin);
  await signNodeRuntimeBinaryForLocalUse(nodeBin);
}

async function stripNodeRuntimeBinary(nodeBin) {
  if (process.platform !== "darwin") {
    return;
  }
  await run("strip", ["-x", nodeBin]);
}

async function signNodeRuntimeBinaryForLocalUse(nodeBin) {
  if (process.platform !== "darwin") {
    return;
  }
  await run("codesign", ["--force", "--sign", "-", nodeBin]);
}

async function nodeRuntimeWithinSizeLimit(nodeBin) {
  try {
    const { size } = await stat(nodeBin);
    return size < MAX_NODE_BINARY_BYTES;
  } catch {
    return false;
  }
}

async function assertNodeRuntimeSize(nodeBin) {
  const { size } = await stat(nodeBin);
  if (size >= MAX_NODE_BINARY_BYTES) {
    throw new Error(
      `Node.js runtime node binary is too large (${size} bytes). ChillClaw requires it below ${MAX_NODE_BINARY_BYTES} bytes.`
    );
  }
}

function nodeRuntimePaths(resource) {
  const distName = currentNodeDistName(resource.version);
  const targetDir = resolve(ARTIFACT_ROOT, "node", distName);
  const binDir = join(targetDir, "bin");
  return {
    distName,
    targetDir,
    binDir,
    nodeBin: join(binDir, "node"),
    npmBin: join(binDir, "npm")
  };
}

async function prepareOpenClawRuntime(resource, nodeRuntime) {
  const artifact = bundledArtifact(resource, "directory");
  const targetDir = resolve(ARTIFACT_ROOT, artifact.path);
  const openclawBin = resolve(targetDir, "node_modules", ".bin", "openclaw");
  const packageSpec = pinnedOpenClawPackageSpec(resource);

  await installPackedOpenClawRuntime(targetDir, packageSpec, nodeRuntime);
  await requireExecutablePath(openclawBin, "OpenClaw runtime package did not produce node_modules/.bin/openclaw.");
  await run(openclawBin, ["--version"], {
    pathPrefix: nodeRuntime.binDir
  });
  log(`Prepared OpenClaw ${resource.version} runtime package at ${targetDir}.`);
}

async function installPackedOpenClawRuntime(targetDir, packageSpec, nodeRuntime) {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-openclaw-runtime-"));
  const runtimeDir = resolve(tempDir, "openclaw-runtime");
  const packageRoot = resolve(runtimeDir, "node_modules", "openclaw");

  try {
    const packOutput = await capture(nodeRuntime.npmBin, ["pack", packageSpec, "--ignore-scripts", "--json"], {
      cwd: tempDir,
      pathPrefix: nodeRuntime.binDir
    });
    const archiveName = parseNpmPackArchiveName(packOutput);
    await run("tar", ["-xzf", resolve(tempDir, archiveName), "-C", tempDir]);
    await mkdir(dirname(packageRoot), { recursive: true });
    await rename(resolve(tempDir, "package"), packageRoot);
    await run(nodeRuntime.npmBin, ["install", "--omit=dev", "--omit=optional", "--package-lock=false", "--legacy-peer-deps"], {
      cwd: packageRoot,
      pathPrefix: nodeRuntime.binDir
    });
    await prunePackagedNodeModules(packageRoot);
    await createOpenClawBinShim(runtimeDir);
    await requireExecutablePath(
      resolve(runtimeDir, "node_modules", ".bin", "openclaw"),
      "OpenClaw runtime package did not produce node_modules/.bin/openclaw."
    );
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(dirname(targetDir), { recursive: true });
    await rename(runtimeDir, targetDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function createOpenClawBinShim(runtimeDir) {
  const binDir = resolve(runtimeDir, "node_modules", ".bin");
  const openclawEntry = resolve(runtimeDir, "node_modules", "openclaw", "openclaw.mjs");
  const openclawBin = resolve(binDir, "openclaw");

  await mkdir(binDir, { recursive: true });
  await chmod(openclawEntry, 0o755);
  await rm(openclawBin, { force: true });
  await symlink("../openclaw/openclaw.mjs", openclawBin);
}

async function prunePackagedNodeModules(packageRoot) {
  await prunePackagedNodeModulesDir(resolve(packageRoot, "node_modules"));
}

async function prunePackagedNodeModulesDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
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

function pinnedOpenClawPackageSpec(resource) {
  const version = resource.version?.trim();
  if (!version || version === "latest") {
    throw new Error("openclaw-runtime must pin a concrete version before preparing bundled artifacts.");
  }
  return `openclaw@${version}`;
}

async function preparePersonalWechatPlugin(resource, nodeRuntime) {
  const artifact = bundledArtifact(resource, "directory");
  const targetDir = resolve(ARTIFACT_ROOT, artifact.path);
  const packageSpec = pinnedWechatPluginPackageSpec(resource, artifact);
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-wechat-plugin-"));

  try {
    const packOutput = await capture(nodeRuntime.npmBin, ["pack", packageSpec, "--ignore-scripts", "--json"], {
      cwd: tempDir,
      pathPrefix: nodeRuntime.binDir
    });
    const archiveName = parseNpmPackArchiveName(packOutput);
    await run("tar", ["-xzf", resolve(tempDir, archiveName), "-C", tempDir]);
    const extractedDir = resolve(tempDir, "package");
    await run(nodeRuntime.npmBin, ["install", "--omit=dev", "--ignore-scripts", "--package-lock=false"], {
      cwd: extractedDir,
      pathPrefix: nodeRuntime.binDir
    });
    await vendorPluginDependencies(extractedDir);
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(dirname(targetDir), { recursive: true });
    await rename(extractedDir, targetDir);
    await requirePreparedWechatPlugin(targetDir, resource.version);
    log(`Prepared ${WECHAT_PLUGIN_PACKAGE} ${resource.version} plugin artifact at ${targetDir}.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function pinnedWechatPluginPackageSpec(resource, artifact) {
  const version = resource.version?.trim();
  if (!version || version === "latest") {
    throw new Error("wechat-plugin-openclaw-weixin must pin a concrete version before preparing bundled artifacts.");
  }
  const packageName = artifact.package?.trim() || WECHAT_PLUGIN_PACKAGE;
  return `${packageName}@${version}`;
}

function parseNpmPackArchiveName(output) {
  const parsed = JSON.parse(output);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const filename = entries.find((entry) => typeof entry?.filename === "string")?.filename;
  if (!filename) {
    throw new Error("npm pack did not report a package archive filename.");
  }
  return filename;
}

async function vendorPluginDependencies(pluginDir) {
  const packageJsonPath = resolve(pluginDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.chillclawBundledDependencies = Object.keys(packageJson.dependencies ?? {});
  packageJson.dependencies = {};
  delete packageJson.devDependencies;
  delete packageJson.scripts;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function requirePreparedWechatPlugin(pluginDir, expectedVersion) {
  const packageJson = JSON.parse(await readFile(resolve(pluginDir, "package.json"), "utf8"));
  if (packageJson.name !== WECHAT_PLUGIN_PACKAGE) {
    throw new Error(`Prepared WeChat plugin has unexpected package name: ${packageJson.name}`);
  }
  if (packageJson.version !== expectedVersion) {
    throw new Error(`Prepared WeChat plugin has version ${packageJson.version}, expected ${expectedVersion}.`);
  }
  if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
    throw new Error("Prepared WeChat plugin must vendor runtime dependencies for offline installer use.");
  }
  await access(resolve(pluginDir, "index.ts"), constants.R_OK);
  await access(resolve(pluginDir, "node_modules", "zod"), constants.R_OK);
  await access(resolve(pluginDir, "node_modules", "qrcode-terminal"), constants.R_OK);
}

function currentNodeDistName(version) {
  const arch = process.arch === "x64" ? "x64" : "arm64";
  return `node-v${version}-darwin-${arch}`;
}

async function prepareOllamaRuntime(resource) {
  const artifact = bundledArtifact(resource, "file");
  const targetPath = resolve(ARTIFACT_ROOT, artifact.path);
  if (await exists(targetPath)) {
    await chmod(targetPath, 0o755);
    log(`Ollama CLI runtime already prepared at ${targetPath}.`);
    return;
  }

  const download = downloadArtifact(resource);
  if (download.format !== "tgz") {
    throw new Error(`Ollama runtime preparation expects a tgz download, got ${download.format}.`);
  }

  const archiveName = basename(new URL(download.url).pathname);
  const archivePath = resolve(CACHE_DIR, archiveName);
  await mkdir(CACHE_DIR, { recursive: true });
  await downloadFile(download.url, archivePath);
  if (download.sha256) {
    await verifyDigest(archivePath, download.sha256);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-ollama-runtime-"));
  try {
    await run("tar", ["-xzf", archivePath, "-C", tempDir]);
    const ollamaCli = await findByName(tempDir, "ollama");
    if (!ollamaCli) {
      throw new Error("Downloaded Ollama archive is missing the ollama CLI binary.");
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(ollamaCli, targetPath);
    await chmod(targetPath, 0o755);
    log(`Prepared runnable Ollama CLI at ${targetPath}.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function prepareLocalModelCatalog(resource) {
  const artifact = bundledArtifact(resource, "json");
  const targetPath = resolve(ARTIFACT_ROOT, artifact.path);
  const tiers = JSON.parse(await readFile(LOCAL_MODEL_CATALOG_SOURCE, "utf8"));
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error(`Local model catalog source is empty or invalid: ${LOCAL_MODEL_CATALOG_SOURCE}`);
  }
  const catalog = {
    version: resource.version,
    provider: "ollama",
    tiers
  };

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(catalog, null, 2)}\n`);
  log(`Prepared local model catalog at ${targetPath}.`);
}

async function downloadFile(url, destination) {
  if (await exists(destination)) {
    log(`Using cached ${destination}.`);
    return;
  }

  log(`Downloading ${url}.`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}.`);
  }

  const tempPath = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
    await rename(tempPath, destination);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function nodeDigestForArchive(shasumsUrl, archiveName) {
  log(`Downloading ${shasumsUrl}.`);
  const response = await fetch(shasumsUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Node.js SHASUMS: HTTP ${response.status}.`);
  }
  const shasums = await response.text();
  const line = shasums.split(/\r?\n/u).find((candidate) => candidate.endsWith(`  ${archiveName}`));
  const digest = line?.split(/\s+/u)[0];
  if (!digest) {
    throw new Error(`Node.js SHASUMS did not include ${archiveName}.`);
  }
  return digest;
}

async function verifyDigest(path, expectedDigest) {
  const actualDigest = await sha256File(path);
  if (actualDigest !== expectedDigest.toLowerCase()) {
    await rm(path, { force: true });
    throw new Error(`Digest mismatch for ${path}. Expected ${expectedDigest}, got ${actualDigest}.`);
  }
  log(`Verified sha256 for ${path}.`);
}

function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolvePromise(hash.digest("hex"));
    });
  });
}

async function findByName(dir, name) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) {
      return path;
    }
    if (entry.isDirectory()) {
      const match = await findByName(path, name);
      if (match) {
        return match;
      }
    }
  }
  return undefined;
}

async function assertNoInstallerPayloads(dir) {
  if (!await exists(dir)) {
    return;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.name.endsWith(".app") || entry.name.endsWith(".dmg") || entry.name.endsWith(".pkg")) {
      throw new Error(`Runtime artifacts must be runnable CLI payloads, not installer/UI payloads: ${path}`);
    }
    if (entry.isDirectory()) {
      await assertNoInstallerPayloads(path);
    }
  }
}

async function requireExecutablePath(path, message) {
  if (!await executable(path)) {
    throw new Error(message);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const env = commandEnv(options);
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

function capture(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: commandEnv(options),
      stdio: ["ignore", "pipe", "inherit"]
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

function commandEnv(options = {}) {
  return options.pathPrefix
    ? {
        ...process.env,
        PATH: [options.pathPrefix, process.env.PATH].filter(Boolean).join(delimiter)
      }
    : process.env;
}

function log(message) {
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "prepare-runtime-artifacts",
    message
  });
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
