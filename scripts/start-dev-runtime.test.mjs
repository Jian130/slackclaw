import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  DEV_RUNTIME_ENV,
  OPENCLAW_RUNTIME_PREFERENCE_ENV,
  createDevRuntimeConfig,
  normalizeDevRuntimeMode
} from "./start-dev-runtime.mjs";

test("dev runtime defaults to managed-local", () => {
  assert.equal(normalizeDevRuntimeMode(undefined), "managed-local");
  assert.equal(normalizeDevRuntimeMode(""), "managed-local");
});

test("dev runtime accepts managed and environment aliases", () => {
  assert.equal(normalizeDevRuntimeMode("managed"), "managed-local");
  assert.equal(normalizeDevRuntimeMode("managed-local"), "managed-local");
  assert.equal(normalizeDevRuntimeMode("environment"), "environment");
  assert.equal(normalizeDevRuntimeMode("system"), "environment");
});

test("dev runtime rejects unknown modes before startup", () => {
  assert.throws(
    () => normalizeDevRuntimeMode("external"),
    /CHILLCLAW_DEV_RUNTIME must be one of: managed, managed-local, environment, system/
  );
});

test("managed dev runtime uses repo-local data and OpenClaw home", () => {
  const rootDir = "/tmp/chillclaw";
  const config = createDevRuntimeConfig({
    rootDir,
    env: {
      [DEV_RUNTIME_ENV]: "managed",
      HOME: "/Users/someone",
      CHILLCLAW_DATA_DIR: "/Users/someone/Library/Application Support/ChillClaw/data"
    }
  });

  assert.equal(config.mode, "managed-local");
  assert.equal(config.extraEnv.CHILLCLAW_DATA_DIR, resolve(rootDir, "apps/daemon/.data"));
  assert.equal(config.extraEnv.HOME, resolve(rootDir, ".data/openclaw-home"));
  assert.equal(config.extraEnv[OPENCLAW_RUNTIME_PREFERENCE_ENV], "managed-local");
});

test("environment dev runtime preserves caller home and data dir", () => {
  const config = createDevRuntimeConfig({
    rootDir: "/tmp/chillclaw",
    env: {
      [DEV_RUNTIME_ENV]: "environment",
      HOME: "/Users/someone",
      CHILLCLAW_DATA_DIR: "/tmp/external-data"
    }
  });

  assert.equal(config.mode, "environment");
  assert.equal(config.extraEnv.HOME, undefined);
  assert.equal(config.extraEnv.CHILLCLAW_DATA_DIR, undefined);
  assert.equal(config.extraEnv[OPENCLAW_RUNTIME_PREFERENCE_ENV], "environment");
});

test("npm start prepares the managed runtime before launching the daemon", async () => {
  const source = await readFile(new URL("./start-dev.mjs", import.meta.url), "utf8");
  const prepareIndex = source.indexOf("prepareDevRuntime(");
  const daemonIndex = source.indexOf('runBackgroundStep("Starting daemon"');

  assert.notEqual(prepareIndex, -1);
  assert.notEqual(daemonIndex, -1);
  assert.ok(prepareIndex < daemonIndex);
});

test("npm start keeps daemon and UI output visible in the terminal", async () => {
  const source = await readFile(new URL("./start-dev.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function runBackgroundStep(");
  const end = source.indexOf("function wait(", start);
  const runBackgroundStep = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(runBackgroundStep, /stdio:\s*"inherit"/u);
  assert.doesNotMatch(runBackgroundStep, /openBackgroundLogs/u);
  assert.doesNotMatch(runBackgroundStep, /child\.unref\(\)/u);
});
