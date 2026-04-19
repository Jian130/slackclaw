import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createRuntimeManager, resolvePackagedRuntimeManifestForCurrentPlatform } from "./default-runtime-manager.js";
import { getManagedNodeDistName } from "../runtime-paths.js";
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
  const previousUpdateFeed = process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL;
  const updateFeedServer = createServer((_, response) => {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("runtime update feed is not published yet");
  });

  const manifest: RuntimeManifestDocument = {
    resources: [
      {
        id: "openclaw-runtime",
        kind: "engine",
        label: "OpenClaw runtime",
        version: "2026.4.15",
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
    updateFeedServer.listen(0, "127.0.0.1");
    await once(updateFeedServer, "listening");
    await mkdir(join(bundledRuntimeDir, "node_modules", ".bin"), { recursive: true });
    await writeFile(bundledOpenClawBin, "#!/bin/sh\nprintf '2026.4.15\\n'\n");
    await chmod(bundledOpenClawBin, 0o755);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    process.env.CHILLCLAW_DATA_DIR = dataDir;
    process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR = bundleDir;
    process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH = manifestPath;
    process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL = `http://127.0.0.1:${(updateFeedServer.address() as AddressInfo).port}/runtime-update.json`;

    const result = await createRuntimeManager().prepare("openclaw-runtime");

    assert.equal(result.status, "completed");
    assert.equal(result.resource.desiredVersion, "2026.4.15");
    assert.equal(result.resource.installedVersion, "2026.4.15");
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
    if (previousUpdateFeed === undefined) {
      delete process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL;
    } else {
      process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL = previousUpdateFeed;
    }
    if (updateFeedServer.listening) {
      await new Promise<void>((resolveClose) => updateFeedServer.close(() => resolveClose()));
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("managed OpenClaw runtime update installs a concrete npm package without wrapper-level duplicate dependencies", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-openclaw-npm-update-test-"));
  const dataDir = join(tempDir, "data");
  const bundleDir = join(tempDir, "bundle");
  const bundledRuntimeDir = join(bundleDir, "openclaw", "openclaw-runtime");
  const bundledOpenClawBin = join(bundledRuntimeDir, "node_modules", ".bin", "openclaw");
  const managedNodeBinDir = join(dataDir, "node-runtime", getManagedNodeDistName(), "bin");
  const managedNpmBin = join(managedNodeBinDir, "npm");
  const manifestPath = join(bundleDir, "runtime-manifest.lock.json");
  const updateManifestPath = join(tempDir, "runtime-update.json");
  const previousDataDir = process.env.CHILLCLAW_DATA_DIR;
  const previousBundleDir = process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR;
  const previousManifestPath = process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH;
  const previousUpdateFeed = process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL;

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
  const updateManifest: RuntimeManifestDocument = {
    resources: [
      {
        ...manifest.resources[0]!,
        version: "2026.4.13",
        sourcePolicy: ["download"],
        artifacts: [
          {
            source: "download",
            format: "npm-package",
            package: "openclaw",
            version: "2026.4.13"
          }
        ]
      }
    ]
  };

  try {
    await mkdir(join(bundledRuntimeDir, "node_modules", ".bin"), { recursive: true });
    await writeFile(bundledOpenClawBin, "#!/bin/sh\nprintf 'OpenClaw 2026.3.11 (test)\\n'\n");
    await chmod(bundledOpenClawBin, 0o755);
    await mkdir(managedNodeBinDir, { recursive: true });
    await writeFile(
      managedNpmBin,
      [
        "#!/bin/sh",
        "if [ \"$1\" = \"--version\" ]; then",
        "  printf '10.0.0\\n'",
        "  exit 0",
        "fi",
        "if [ \"$1\" = \"pack\" ]; then",
        "  spec=\"$2\"",
        "  destination=\".\"",
        "  shift 2",
        "  while [ \"$#\" -gt 0 ]; do",
        "    if [ \"$1\" = \"--pack-destination\" ]; then",
        "      destination=\"$2\"",
        "      shift 2",
        "      continue",
        "    fi",
        "    shift",
        "  done",
        "  if [ \"$spec\" != \"openclaw@2026.4.13\" ]; then",
        "    printf 'unexpected package spec: %s\\n' \"$spec\" >&2",
        "    exit 2",
        "  fi",
        "  mkdir -p \"$destination/package\"",
        "  cat > \"$destination/package/package.json\" <<'EOF'",
        "{\"name\":\"openclaw\",\"version\":\"2026.4.13\",\"bin\":{\"openclaw\":\"openclaw.mjs\"},\"dependencies\":{\"package-local-dep\":\"1.0.0\"}}",
        "EOF",
        "  cat > \"$destination/package/openclaw.mjs\" <<'EOF'",
        "#!/bin/sh",
        "printf 'OpenClaw 2026.4.13 (test)\\n'",
        "EOF",
        "  chmod +x \"$destination/package/openclaw.mjs\"",
        "  (cd \"$destination\" && tar -czf openclaw-2026.4.13.tgz package)",
        "  rm -rf \"$destination/package\"",
        "  printf '[{\"filename\":\"openclaw-2026.4.13.tgz\"}]\\n'",
        "  exit 0",
        "fi",
        "if [ \"$1\" = \"install\" ] && [ \"$2\" = \"--prefix\" ]; then",
        "  prefix=\"$3\"",
        "  mkdir -p \"$prefix/node_modules/package-local-dep\"",
        "  mkdir -p \"$prefix/node_modules/package-local-dep/test\"",
        "  mkdir -p \"$prefix/node_modules/package-local-dep/.github/workflows\"",
        "  printf '{\"name\":\"package-local-dep\",\"version\":\"1.0.0\"}\\n' > \"$prefix/node_modules/package-local-dep/package.json\"",
        "  printf 'fixture\\n' > \"$prefix/node_modules/package-local-dep/test/runtime-fixture.txt\"",
        "  printf 'ci\\n' > \"$prefix/node_modules/package-local-dep/.github/workflows/ci.yml\"",
        "  printf '%s\\n' \"$@\" > \"$prefix/npm-args.txt\"",
        "  exit 0",
        "fi",
        "printf 'unexpected npm args: %s\\n' \"$*\" >&2",
        "exit 1",
        ""
      ].join("\n")
    );
    await chmod(managedNpmBin, 0o755);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await writeFile(updateManifestPath, JSON.stringify(updateManifest, null, 2));
    process.env.CHILLCLAW_DATA_DIR = dataDir;
    process.env.CHILLCLAW_RUNTIME_BUNDLE_DIR = bundleDir;
    process.env.CHILLCLAW_RUNTIME_MANIFEST_PATH = manifestPath;
    process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL = updateManifestPath;

    const manager = createRuntimeManager();
    await manager.prepare("openclaw-runtime");
    await manager.stageUpdate("openclaw-runtime");
    const result = await manager.applyUpdate("openclaw-runtime");

    assert.equal(result.status, "completed");
    assert.equal(result.resource.installedVersion, "2026.4.13");
    await access(join(dataDir, "openclaw-runtime", "node_modules", ".bin", "openclaw"), constants.X_OK);
    await access(
      join(dataDir, "openclaw-runtime", "node_modules", "openclaw", "node_modules", "package-local-dep", "package.json"),
      constants.R_OK
    );
    await assert.rejects(
      access(
        join(dataDir, "openclaw-runtime", "node_modules", "openclaw", "node_modules", "package-local-dep", "test"),
        constants.R_OK
      )
    );
    await assert.rejects(
      access(
        join(dataDir, "openclaw-runtime", "node_modules", "openclaw", "node_modules", "package-local-dep", ".github"),
        constants.R_OK
      )
    );
    await assert.rejects(
      access(join(dataDir, "openclaw-runtime", "node_modules", "package-local-dep", "package.json"), constants.R_OK)
    );
    assert.match(
      await readFile(join(dataDir, "openclaw-runtime", "node_modules", "openclaw", "npm-args.txt"), "utf8"),
      /install\n--prefix\n.+openclaw-runtime\/node_modules\/openclaw\n--omit=dev\n--package-lock=false\n--legacy-peer-deps/u
    );
    assert.equal(resolve(dataDir, "openclaw-runtime").startsWith(dataDir), true);
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
    if (previousUpdateFeed === undefined) {
      delete process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL;
    } else {
      process.env.CHILLCLAW_RUNTIME_UPDATE_FEED_URL = previousUpdateFeed;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
