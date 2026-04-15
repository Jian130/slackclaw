import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RuntimeManager, type RuntimeResourceProvider, type RuntimeManagerState } from "./runtime-manager.js";
import type { RuntimeArtifactManifest, RuntimeResourceManifest } from "./types.js";

function manifest(
  id: string,
  version: string,
  overrides: Partial<RuntimeResourceManifest> = {}
): RuntimeResourceManifest {
  return {
    id,
    kind: "other",
    label: id,
    version,
    platforms: [{ os: process.platform, arch: process.arch }],
    sourcePolicy: ["bundled", "download"],
    updatePolicy: "stage-silently-apply-safely",
    installDir: join(tmpdir(), "chillclaw-runtime-test", id),
    artifacts: [],
    dependencies: [],
    ...overrides
  };
}

function createProvider(id: string, log: string[], options: Partial<RuntimeResourceProvider> = {}): RuntimeResourceProvider {
  let installedVersion: string | undefined;

  return {
    id,
    async inspect() {
      return installedVersion
        ? {
            installed: true,
            ready: true,
            version: installedVersion,
            summary: `${id} ready.`,
            detail: `${id} ${installedVersion} verified.`
          }
        : {
            installed: false,
            ready: false,
            summary: `${id} missing.`,
            detail: `${id} is not installed.`
          };
    },
    async prepare(context) {
      log.push(`prepare:${id}:${context.source}`);
      installedVersion = context.manifest.version;
      return {
        version: installedVersion,
        changed: true,
        summary: `${id} installed.`,
        detail: `${id} installed from ${context.source}.`
      };
    },
    async applyUpdate(context) {
      log.push(`apply:${id}:${context.staged.version}`);
      installedVersion = context.staged.version;
      return {
        version: installedVersion,
        changed: true,
        summary: `${id} updated.`,
        detail: `${id} updated to ${installedVersion}.`
      };
    },
    async rollback(context) {
      log.push(`rollback:${id}:${context.previousVersion ?? "none"}`);
      installedVersion = context.previousVersion;
      return {
        version: installedVersion,
        changed: true,
        summary: `${id} rolled back.`,
        detail: `${id} rollback completed.`
      };
    },
    ...options
  };
}

function createHarness(args: {
  manifests: RuntimeResourceManifest[];
  updateManifests?: RuntimeResourceManifest[];
  providers: RuntimeResourceProvider[];
  downloadArtifact?: (context: {
    resource: RuntimeResourceManifest;
    artifact: RuntimeArtifactManifest;
  }) => Promise<{ artifact: RuntimeArtifactManifest; jobId?: string }>;
}) {
  let state: RuntimeManagerState | undefined;
  const progress: string[] = [];
  const completed: string[] = [];
  const staged: string[] = [];

  const manager = new RuntimeManager({
    loadManifest: async () => ({ resources: args.manifests }),
    loadUpdateManifest: async () => ({ resources: args.updateManifests ?? [] }),
    readState: async () => state,
    writeState: async (nextState) => {
      state = nextState;
    },
    providers: args.providers,
    downloadArtifact: args.downloadArtifact,
    publishProgress: ({ resourceId, action }) => {
      progress.push(`${resourceId}:${action}`);
    },
    publishCompleted: ({ resourceId, action, status }) => {
      completed.push(`${resourceId}:${action}:${status}`);
    },
    publishUpdateStaged: ({ resourceId, version }) => {
      staged.push(`${resourceId}:${version}`);
    }
  });

  return {
    manager,
    getState: () => state,
    progress,
    completed,
    staged
  };
}

test("prepare installs dependencies first and prefers bundled source before download", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "chillclaw-runtime-manager-bundle-"));
  const bundlePath = join(tempDir, "node-runtime.tar.gz");
  await writeFile(bundlePath, "bundle");
  const log: string[] = [];
  const node = manifest("node-npm-runtime", "22.22.2", {
    artifacts: [{ source: "bundled", path: bundlePath, format: "file" }]
  });
  const openclaw = manifest("openclaw-runtime", "2026.4.13", {
    dependencies: ["node-npm-runtime"],
    artifacts: [
      { source: "bundled", path: bundlePath, format: "file" },
      { source: "download", url: "https://example.invalid/openclaw.tgz", format: "tgz" }
    ]
  });
  const { manager, getState } = createHarness({
    manifests: [openclaw, node],
    providers: [createProvider("node-npm-runtime", log), createProvider("openclaw-runtime", log)]
  });

  try {
    const result = await manager.prepare("openclaw-runtime");

    assert.equal(result.status, "completed");
    assert.deepEqual(log, ["prepare:node-npm-runtime:bundled", "prepare:openclaw-runtime:bundled"]);
    assert.equal(getState()?.resources["openclaw-runtime"]?.installedVersion, "2026.4.13");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("prepare delegates downloadable runtime artifacts before invoking the provider", async () => {
  const log: string[] = [];
  const runtime = manifest("node-npm-runtime", "22.22.2", {
    sourcePolicy: ["download"],
    artifacts: [{ source: "download", url: "https://example.invalid/node.tgz", format: "tgz", sizeBytes: 12 }]
  });
  const { manager, getState } = createHarness({
    manifests: [runtime],
    providers: [
      createProvider("node-npm-runtime", log, {
        async prepare(context) {
          assert.equal(context.artifact?.path, "/tmp/chillclaw/downloads/node.tgz");
          log.push(`prepare:${context.manifest.id}:${context.source}:${context.artifact?.path}`);
          return {
            version: context.manifest.version,
            changed: true,
            summary: "Node runtime installed.",
            detail: "Node runtime installed from downloaded archive."
          };
        }
      })
    ],
    downloadArtifact: async ({ resource, artifact }) => {
      assert.equal(resource.id, "node-npm-runtime");
      assert.equal(artifact.url, "https://example.invalid/node.tgz");
      return {
        artifact: {
          ...artifact,
          path: "/tmp/chillclaw/downloads/node.tgz"
        },
        jobId: "download-node"
      };
    }
  });

  const result = await manager.prepare("node-npm-runtime");

  assert.equal(result.status, "completed");
  assert.deepEqual(log, ["prepare:node-npm-runtime:download:/tmp/chillclaw/downloads/node.tgz"]);
  assert.equal(getState()?.resources["node-npm-runtime"]?.downloadJobId, "download-node");
});

test("stage update records the staged version without changing the active install", async () => {
  const log: string[] = [];
  const { manager, getState, staged } = createHarness({
    manifests: [manifest("ollama-runtime", "0.20.5")],
    updateManifests: [manifest("ollama-runtime", "0.20.6")],
    providers: [createProvider("ollama-runtime", log)]
  });

  await manager.prepare("ollama-runtime");
  const result = await manager.stageUpdate("ollama-runtime");

  assert.equal(result.status, "completed");
  assert.equal(getState()?.resources["ollama-runtime"]?.installedVersion, "0.20.5");
  assert.equal(getState()?.resources["ollama-runtime"]?.stagedVersion, "0.20.6");
  assert.deepEqual(staged, ["ollama-runtime:0.20.6"]);
});

test("background staging only stages approved updates for installed resources", async () => {
  const log: string[] = [];
  const { manager, getState, staged } = createHarness({
    manifests: [
      manifest("node-npm-runtime", "22.22.2"),
      manifest("ollama-runtime", "0.20.5")
    ],
    updateManifests: [
      manifest("node-npm-runtime", "22.23.0"),
      manifest("ollama-runtime", "0.20.6")
    ],
    providers: [
      createProvider("node-npm-runtime", log),
      createProvider("ollama-runtime", log)
    ]
  });

  await manager.prepare("node-npm-runtime");
  const results = await manager.stageApprovedUpdates();

  assert.equal(results.length, 1);
  assert.equal(results[0]?.resource.id, "node-npm-runtime");
  assert.equal(getState()?.resources["node-npm-runtime"]?.stagedVersion, "22.23.0");
  assert.equal(getState()?.resources["ollama-runtime"]?.stagedVersion, undefined);
  assert.deepEqual(staged, ["node-npm-runtime:22.23.0"]);
});

test("apply update rolls back to the previous version when provider verification fails", async () => {
  const log: string[] = [];
  let failApply = false;
  const provider = createProvider("ollama-runtime", log, {
    async applyUpdate(context) {
      log.push(`apply:ollama-runtime:${context.staged.version}`);
      if (failApply) {
        throw new Error("Ollama verification failed.");
      }
      return {
        version: context.staged.version,
        changed: true,
        summary: "Ollama updated.",
        detail: "Ollama update verified."
      };
    }
  });
  const { manager, getState } = createHarness({
    manifests: [manifest("ollama-runtime", "0.20.5")],
    updateManifests: [manifest("ollama-runtime", "0.20.6")],
    providers: [provider]
  });

  await manager.prepare("ollama-runtime");
  await manager.stageUpdate("ollama-runtime");
  failApply = true;
  const result = await manager.applyUpdate("ollama-runtime");

  assert.equal(result.status, "failed");
  assert.equal(result.resource.installedVersion, "0.20.5");
  assert.equal(getState()?.resources["ollama-runtime"]?.status, "rollback-required");
  assert.deepEqual(log.at(-2), "apply:ollama-runtime:0.20.6");
  assert.deepEqual(log.at(-1), "rollback:ollama-runtime:0.20.5");
});

test("prepare rejects unsupported runtime platforms", async () => {
  const { manager } = createHarness({
    manifests: [
      manifest("node-npm-runtime", "22.22.2", {
        platforms: [{ os: "win32", arch: "x64" }]
      })
    ],
    providers: [createProvider("node-npm-runtime", [])]
  });

  await assert.rejects(() => manager.prepare("node-npm-runtime"), /not supported on this platform/);
});
