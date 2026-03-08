import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultProductOverview } from "./index.js";

test("default product overview starts with OpenClaw not installed", () => {
  const overview = createDefaultProductOverview();

  assert.equal(overview.engine.engine, "openclaw");
  assert.equal(overview.engine.installed, false);
  assert.equal(overview.templates.length > 4, true);
  assert.equal(overview.recoveryActions.some((action) => action.id === "reinstall-engine"), true);
});
