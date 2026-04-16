import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRuntimeManager, resolvePackagedRuntimeManifestForCurrentPlatform } from "./default-runtime-manager.js";
import type { RuntimeManifestDocument } from "./types.js";

test("packaged Node runtime manifest resolves to the current Mac architecture", () => {
  const manifest: RuntimeManifestDocument = {
    resources: [
      {
        id: "node-npm-runtime",
        kind: "node-npm",
        label: "Node.js and npm runtime",
        version: "22.22.2",
        platforms: [{ os: "darwin", arch: "*" }],
        sourcePolicy: ["bundled", "download"],
        updatePolicy: "stage-silently-apply-safely",
        installDir: "node-runtime",
        activePath: "node-runtime/node-v22.22.2-darwin-arm64/bin/npm",
        artifacts: [
          {
            source: "bundled",
            format: "directory",
            path: "node/node-v22.22.2-darwin-arm64"
          }
        ],
        dependencies: []
      }
    ]
  };

  const resolved = resolvePackagedRuntimeManifestForCurrentPlatform(manifest, "/bundle", {
    platform: "darwin",
    arch: "x64"
  });
  const node = resolved.resources[0];

  assert.equal(node?.activePath, "node-runtime/node-v22.22.2-darwin-x64/bin/npm");
  assert.equal(node?.artifacts[0]?.path, "/bundle/node/node-v22.22.2-darwin-x64");
  assert.deepEqual(node?.platforms, [{ os: "darwin", arch: "x64" }]);
});

test("managed OpenClaw runtime installs from a bundled directory artifact", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-openclaw-bundle-test-"));
  const dataDir = join(tempDir, "data");
  const bundleDir = join(tempDir, "bundle");
  const bundledRuntimeDir = join(bundleDir, "openclaw", "openclaw-runtime");
  const bundledOpenClawBin = join(bundledRuntimeDir, "node_modules", ".bin", "openclaw");
  const manifestPath = join(bundleDir, "runtime-manifest.lock.json");
  const previousDataDir = process.env.CHILLCLAW_DATA_DIR;
  const previousBundleDir = process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR;
  const previousManifestPath = process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH;

  const manifest: RuntimeManifestDocument = {
    resources: [
      {
        id: "openclaw-runtime",
        kind: "engine",
        label: "OpenClaw runtime",
        version: "2026.3.11",
        platforms: [{ os: process.platform, arch: process.arch }],
        sourcePolicy: ["bundled"],
        updatePolicy: "stage-silently-apply-safely",
        installDir: "openclaw-runtime",
        activePath: "openclaw-runtime/node_modules/.bin/openclaw",
        artifacts: [
          {
            source: "bundled",
            format: "directory",
            path: "openclaw/openclaw-runtime"
          }
        ],
        dependencies: []
      }
    ]
  };

  try {
    await mkdir(join(bundledRuntimeDir, "node_modules", ".bin"), { recursive: true });
    await writeFile(bundledOpenClawBin, "#!/bin/sh\nprintf '2026.3.11\\n'\n");
    await chmod(bundledOpenClawBin, 0o755);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    process.env.CHILLCLAW_DATA_DIR = dataDir;
    process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR = bundleDir;
    process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH = manifestPath;

    const result = await createRuntimeManager().prepare("openclaw-runtime");

    assert.equal(result.status, "completed");
    assert.equal(result.resource.desiredVersion, "2026.3.11");
    assert.equal(result.resource.installedVersion, "2026.3.11");
    await access(join(dataDir, "openclaw-runtime", "node_modules", ".bin", "openclaw"), constants.X_OK);
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.CHILLCLAW_DATA_DIR;
    } else {
      process.env.CHILLCLAW_DATA_DIR = previousDataDir;
    }
    if (previousBundleDir === undefined) {
      delete process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR;
    } else {
      process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR = previousBundleDir;
    }
    if (previousManifestPath === undefined) {
      delete process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH;
    } else {
      process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH = previousManifestPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
