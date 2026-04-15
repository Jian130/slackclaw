#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import { writeScriptLogLine } from "./logging.mjs";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "runtime-manifest.lock.json");
const ARTIFACT_ROOT = resolve(ROOT, "runtime-artifacts");
const CACHE_DIR = resolve(ROOT, "dist/runtime-artifact-downloads");
const SCRIPT_LABEL = "ChillClaw runtime artifacts";

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));

  await prepareNodeRuntime(resourceFor(manifest, "node-npm-runtime"));
  await prepareOllamaRuntime(resourceFor(manifest, "ollama-runtime"));
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
  const distName = currentNodeDistName(resource.version);
  const targetDir = resolve(ARTIFACT_ROOT, "node", distName);
  const nodeBin = join(targetDir, "bin", "node");
  const npmBin = join(targetDir, "bin", "npm");
  if (await executable(nodeBin) && await executable(npmBin)) {
    log(`Node.js runtime already prepared at ${targetDir}.`);
    return;
  }

  const archiveName = `${distName}.tar.gz`;
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
    await run("tar", ["-xzf", archivePath, "-C", tempDir]);
    const extractedDir = join(tempDir, distName);
    await requireExecutablePath(join(extractedDir, "bin", "node"), "Downloaded Node.js archive node is not executable.");
    await requireExecutablePath(join(extractedDir, "bin", "npm"), "Downloaded Node.js archive npm is not executable.");
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(dirname(targetDir), { recursive: true });
    await rename(extractedDir, targetDir);
    log(`Prepared runnable Node.js runtime at ${targetDir}.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
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
