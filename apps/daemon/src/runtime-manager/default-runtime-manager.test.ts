import test from "node:test";
import assert from "node:assert/strict";

import { resolvePackagedRuntimeManifestForCurrentPlatform } from "./default-runtime-manager.js";
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
