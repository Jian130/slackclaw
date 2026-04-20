import test from "node:test";
import assert from "node:assert/strict";

import { OpenClawToolAccessCoordinator } from "./openclaw-tool-access-coordinator.js";

test("OpenClaw tool access coordinator normalizes global tool config", async () => {
  const coordinator = new OpenClawToolAccessCoordinator({
    engine: "openclaw",
    readOpenClawConfigSnapshot: async () => ({
      config: {
        tools: {
          profile: "coding",
          allow: ["group:web", "group:web", "", 42],
          deny: ["exec"],
          byProvider: {
            "google-antigravity": {
              profile: "minimal",
              allow: ["session_status"],
              deny: ["group:runtime"]
            },
            malformed: ["group:web"]
          }
        }
      }
    })
  });

  const access = await coordinator.getRuntimeToolAccess();

  assert.equal(access.engine, "openclaw");
  assert.equal(access.profile, "coding");
  assert.deepEqual(access.allow, ["group:web"]);
  assert.deepEqual(access.deny, ["exec"]);
  assert.equal(access.byProvider["google-antigravity"]?.profile, "minimal");
  assert.deepEqual(access.byProvider["google-antigravity"]?.allow, ["session_status"]);
  assert.deepEqual(access.byProvider["google-antigravity"]?.deny, ["group:runtime"]);
  assert.equal(access.byProvider.malformed, undefined);
  assert.ok(access.entries.some((entry) => entry.id === "group:web" && entry.kind === "tool-group"));
  assert.ok(access.entries.some((entry) => entry.id === "exec" && entry.kind === "tool"));
  assert.ok(access.entries.some((entry) => entry.id === "session_status" && entry.kind === "tool"));
});

test("OpenClaw tool access coordinator returns default tool groups when config is missing", async () => {
  const coordinator = new OpenClawToolAccessCoordinator({
    engine: "openclaw",
    readOpenClawConfigSnapshot: async () => ({
      config: {}
    })
  });

  const access = await coordinator.getRuntimeToolAccess();

  assert.equal(access.profile, undefined);
  assert.deepEqual(access.allow, []);
  assert.deepEqual(access.deny, []);
  assert.deepEqual(access.byProvider, {});
  assert.ok(access.entries.some((entry) => entry.id === "group:web"));
});
