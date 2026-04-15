import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { getManagedNodeNpmBinPath } from "../runtime-paths.js";
import { ensureManagedNodeNpmInvocation, resolveManagedNodeNpmInvocation } from "./managed-node-runtime.js";

const execFile = promisify(execFileCallback);

async function captureConsoleOutput(callback: () => Promise<void>): Promise<string[]> {
  const originalConsoleLog = console.log;
  const lines: string[] = [];
  console.log = (message?: unknown, ...rest: unknown[]) => {
    lines.push([message, ...rest].map((value) => String(value)).join(" "));
  };

  try {
    await callback();
  } finally {
    console.log = originalConsoleLog;
  }

  return lines;
}

function mockProcessPlatform(platform: NodeJS.Platform): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    enumerable: originalDescriptor?.enumerable ?? true,
    value: platform
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(process, "platform", originalDescriptor);
    }
  };
}

async function createFakeNodeArchive(root: string, version: string): Promise<string> {
  const distName = `node-v${version}-darwin-${process.arch === "x64" ? "x64" : "arm64"}`;
  const distRoot = join(root, distName);
  const binDir = join(distRoot, "bin");
  const archivePath = join(root, `${distName}.tar.gz`);

  await mkdir(binDir, { recursive: true });
  await writeFile(
    join(binDir, "node"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "v${version}"
  exit 0
fi
script="$1"
shift
exec /bin/sh "$script" "$@"
`
  );
  await writeFile(
    join(binDir, "npm"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "10.9.0"
  exit 0
fi
echo "$@" > "${root}/npm-args.txt"
`
  );
  await chmod(join(binDir, "node"), 0o755);
  await chmod(join(binDir, "npm"), 0o755);
  await execFile("/usr/bin/tar", ["-czf", archivePath, "-C", root, distName]);

  return archivePath;
}

async function createFakeNodeRuntimeDir(
  root: string,
  version: string,
  options?: { npmExecutable?: boolean; writeNpmCli?: boolean }
): Promise<string> {
  const distName = `node-v${version}-darwin-${process.arch === "x64" ? "x64" : "arm64"}`;
  const distRoot = join(root, distName);
  const binDir = join(distRoot, "bin");
  const npmCliDir = join(distRoot, "lib", "node_modules", "npm", "bin");

  await mkdir(binDir, { recursive: true });
  await mkdir(npmCliDir, { recursive: true });
  await writeFile(
    join(binDir, "node"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "v${version}"
  exit 0
fi
script="$1"
shift
exec /bin/sh "$script" "$@"
`
  );
  if (options?.writeNpmCli !== false) {
    await writeFile(
      join(npmCliDir, "npm-cli.js"),
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "10.9.0"
  exit 0
fi
echo "$@" > "${root}/npm-runtime-dir-args.txt"
`
    );
    await chmod(join(npmCliDir, "npm-cli.js"), options?.npmExecutable === false ? 0o644 : 0o755);
  }
  await chmod(join(binDir, "node"), 0o755);
  await symlink("../lib/node_modules/npm/bin/npm-cli.js", join(binDir, "npm"));

  return distRoot;
}

test("ensureManagedNodeNpmInvocation installs npm under the ChillClaw runtime", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-managed-node-test-"));
  const dataDir = join(tempDir, "data");
  const version = "99.0.0";
  const archivePath = await createFakeNodeArchive(tempDir, version);
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const originalNodeUrl = process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;
  const restorePlatform = mockProcessPlatform("darwin");

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = version;
  process.env.CHILLCLAW_MANAGED_NODE_DIST_URL = pathToFileURL(archivePath).href;

  try {
    assert.equal(await resolveManagedNodeNpmInvocation(), undefined);

    const invocation = await ensureManagedNodeNpmInvocation();

    assert.equal(invocation.command, getManagedNodeNpmBinPath());
    assert.equal(invocation.argsPrefix.length, 0);
    assert.equal(invocation.display, getManagedNodeNpmBinPath());

    await execFile(invocation.command, [...invocation.argsPrefix, "install", "--prefix", join(tempDir, "openclaw-runtime"), "openclaw@latest"]);
    assert.equal(await readFile(join(tempDir, "npm-args.txt"), "utf8"), "install --prefix " + join(tempDir, "openclaw-runtime") + " openclaw@latest\n");
  } finally {
    restorePlatform();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalNodeVersion;
    }
    if (originalNodeUrl === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_DIST_URL = originalNodeUrl;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ensureManagedNodeNpmInvocation preserves bundled Node relative npm symlink", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-managed-node-runtime-dir-test-"));
  const dataDir = join(tempDir, "data");
  const version = "99.0.1";
  const runtimeDir = await createFakeNodeRuntimeDir(tempDir, version);
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const restorePlatform = mockProcessPlatform("darwin");

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = version;

  try {
    const invocation = await ensureManagedNodeNpmInvocation({ runtimeDir });

    assert.equal(invocation.command, getManagedNodeNpmBinPath());
    assert.equal(await readlink(getManagedNodeNpmBinPath()), "../lib/node_modules/npm/bin/npm-cli.js");
  } finally {
    restorePlatform();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalNodeVersion;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ensureManagedNodeNpmInvocation falls back to download when bundled npm cannot run", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-managed-node-runtime-fallback-test-"));
  const dataDir = join(tempDir, "data");
  const bundledRoot = join(tempDir, "bundled");
  const downloadRoot = join(tempDir, "download");
  const version = "99.0.2";
  const runtimeDir = await createFakeNodeRuntimeDir(bundledRoot, version, {
    npmExecutable: false,
    writeNpmCli: false
  });
  const archivePath = await createFakeNodeArchive(downloadRoot, version);
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const restorePlatform = mockProcessPlatform("darwin");

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = version;

  try {
    const invocation = await ensureManagedNodeNpmInvocation({
      runtimeDir,
      archiveUrl: pathToFileURL(archivePath).href
    });

    await execFile(invocation.command, [...invocation.argsPrefix, "install", "--prefix", join(tempDir, "openclaw-runtime"), "openclaw@latest"]);

    assert.equal(await readFile(join(downloadRoot, "npm-args.txt"), "utf8"), "install --prefix " + join(tempDir, "openclaw-runtime") + " openclaw@latest\n");
  } finally {
    restorePlatform();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalNodeVersion;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ensureManagedNodeNpmInvocation uses bundled node to run npm cli when the npm shim cannot run", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-managed-node-runtime-npm-cli-test-"));
  const dataDir = join(tempDir, "data");
  const bundledRoot = join(tempDir, "bundled");
  const version = "99.0.3";
  const runtimeDir = await createFakeNodeRuntimeDir(bundledRoot, version, { npmExecutable: false });
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const restorePlatform = mockProcessPlatform("darwin");

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = version;

  try {
    const invocation = await ensureManagedNodeNpmInvocation({ runtimeDir });

    assert.match(invocation.command, /\/bin\/node$/);
    assert.deepEqual(invocation.argsPrefix, [
      join(dataDir, "node-runtime", `node-v${version}-darwin-${process.arch === "x64" ? "x64" : "arm64"}`, "lib/node_modules/npm/bin/npm-cli.js")
    ]);

    await execFile(invocation.command, [...invocation.argsPrefix, "install", "--prefix", join(tempDir, "openclaw-runtime"), "openclaw@latest"]);

    assert.equal(await readFile(join(bundledRoot, "npm-runtime-dir-args.txt"), "utf8"), "install --prefix " + join(tempDir, "openclaw-runtime") + " openclaw@latest\n");
  } finally {
    restorePlatform();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalNodeVersion;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ensureManagedNodeNpmInvocation logs npm probe diagnostics for packaged runtime failures", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-managed-node-runtime-log-test-"));
  const dataDir = join(tempDir, "data");
  const bundledRoot = join(tempDir, "bundled");
  const version = "99.0.5";
  const runtimeDir = await createFakeNodeRuntimeDir(bundledRoot, version, { npmExecutable: false });
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const originalRuntimeDiagnostics = process.env.CHILLCLAW_LOG_RUNTIME_DIAGNOSTICS;
  const restorePlatform = mockProcessPlatform("darwin");

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = version;
  process.env.CHILLCLAW_LOG_RUNTIME_DIAGNOSTICS = "1";

  try {
    const lines = await captureConsoleOutput(async () => {
      await ensureManagedNodeNpmInvocation({ runtimeDir });
    });
    const output = lines.join("\n");

    assert.match(output, /managedNodeRuntime\.install/);
    assert.match(output, /copying bundled Node\.js runtime/);
    assert.match(output, /managedNodeRuntime\.probe/);
    assert.match(output, /npm shim failed/);
    assert.match(output, /npm cli via node succeeded/);
  } finally {
    restorePlatform();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalNodeVersion;
    }
    if (originalRuntimeDiagnostics === undefined) {
      delete process.env.CHILLCLAW_LOG_RUNTIME_DIAGNOSTICS;
    } else {
      process.env.CHILLCLAW_LOG_RUNTIME_DIAGNOSTICS = originalRuntimeDiagnostics;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ensureManagedNodeNpmInvocation reports a broken bundled runtime instead of defaulting to a network download", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-managed-node-runtime-broken-bundle-test-"));
  const dataDir = join(tempDir, "data");
  const bundledRoot = join(tempDir, "bundled");
  const version = "99.0.4";
  const runtimeDir = await createFakeNodeRuntimeDir(bundledRoot, version, {
    npmExecutable: false,
    writeNpmCli: false
  });
  const originalDataDir = process.env.CHILLCLAW_DATA_DIR;
  const originalNodeVersion = process.env.CHILLCLAW_MANAGED_NODE_VERSION;
  const originalNodeUrl = process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;
  const restorePlatform = mockProcessPlatform("darwin");

  process.env.CHILLCLAW_DATA_DIR = dataDir;
  process.env.CHILLCLAW_MANAGED_NODE_VERSION = version;
  delete process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;

  try {
    await assert.rejects(
      () => ensureManagedNodeNpmInvocation({ runtimeDir }),
      /bundled Node\.js runtime is not runnable/
    );
  } finally {
    restorePlatform();
    if (originalDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = originalDataDir;
    }
    if (originalNodeVersion === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_VERSION;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_VERSION = originalNodeVersion;
    }
    if (originalNodeUrl === undefined) {
      delete process.env.CHILLCLAW_MANAGED_NODE_DIST_URL;
    } else {
      process.env.CHILLCLAW_MANAGED_NODE_DIST_URL = originalNodeUrl;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
