import test from "node:test";
import assert from "node:assert/strict";

import {
  engineCompatibilityCapabilities,
  engineCompatibilityManifests
} from "./compatibility.js";

test("OpenClaw compatibility manifest includes the full supported capability checklist", () => {
  const supported = new Set(engineCompatibilityManifests.openclaw.supportedCapabilityIds);

  assert.equal(supported.size, engineCompatibilityCapabilities.length);
  assert.equal(supported.has("detect-runtime"), true);
  assert.equal(supported.has("remove-channel"), true);
  assert.equal(supported.has("run-task-through-default-model"), true);
});

test("future engine manifests start empty until adapter support exists", () => {
  assert.deepEqual(engineCompatibilityManifests.zeroclaw.supportedCapabilityIds, []);
  assert.deepEqual(engineCompatibilityManifests.ironclaw.supportedCapabilityIds, []);
});
