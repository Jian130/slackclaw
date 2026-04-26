import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MockAdapter } from "../engine/mock-adapter.js";
import type { RuntimeManager } from "../runtime-manager/runtime-manager.js";
import { OverviewService } from "./overview-service.js";
import { StateStore } from "./state-store.js";
import type { LocalModelRuntimeService } from "./local-model-runtime-service.js";

test("overview service returns ChillClaw product data", async () => {
  const service = new OverviewService(new MockAdapter(), new StateStore("/tmp/chillclaw-overview-test.json"));
  const overview = await service.getOverview();

  assert.equal(overview.appName, "ChillClaw");
  assert.equal(typeof overview.appUpdate.status, "string");
  assert.equal(overview.engine.installed, true);
  assert.equal(Array.isArray(overview.profiles), true);
  assert.equal(overview.channelSetup.baseOnboardingCompleted, true);
  assert.match(overview.channelSetup.gatewaySummary, /Next recommended channel|All channel setup steps are complete|Gateway restarted/);
});

test("overview service skips local runtime probing while first-run onboarding is unfinished", async () => {
  let localRuntimeCalls = 0;
  const localModelRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      throw new Error("First-run overview should not probe Ollama before the model step.");
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OverviewService(
    new MockAdapter(),
    new StateStore(`/tmp/chillclaw-overview-first-run-${randomUUID()}.json`),
    undefined,
    undefined,
    localModelRuntimeService
  );

  const overview = await service.getOverview();

  assert.equal(overview.firstRun.setupCompleted, false);
  assert.equal(localRuntimeCalls, 0);
  assert.equal(overview.localRuntime?.status, "unchecked");
});

test("overview service can skip local runtime probing for install-time reads", async () => {
  let localRuntimeCalls = 0;
  const localModelRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      throw new Error("Install-time overview should not probe Ollama.");
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OverviewService(
    new MockAdapter(),
    new StateStore("/tmp/chillclaw-overview-lightweight-test.json"),
    undefined,
    undefined,
    localModelRuntimeService
  );

  const overview = await service.getOverview({ includeLocalRuntime: false });

  assert.equal(localRuntimeCalls, 0);
  assert.equal(overview.localRuntime?.status, "unchecked");
});

test("overview service falls back when local runtime probing is slow", async () => {
  const store = new StateStore(`/tmp/chillclaw-overview-local-runtime-timeout-${randomUUID()}.json`);
  await store.update((current) => ({
    ...current,
    setupCompletedAt: "2026-04-24T00:00:00.000Z"
  }));

  let localRuntimeCalls = 0;
  const localModelRuntimeService = {
    async getOverview() {
      localRuntimeCalls += 1;
      return new Promise<never>(() => {});
    }
  } as Pick<LocalModelRuntimeService, "getOverview"> as LocalModelRuntimeService;
  const service = new OverviewService(
    new MockAdapter(),
    store,
    undefined,
    undefined,
    localModelRuntimeService
  );

  const overview = await Promise.race([
    service.getOverview(),
    new Promise<"timeout">((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 750))
  ]);

  assert.notEqual(overview, "timeout");
  assert.equal((overview as Awaited<ReturnType<OverviewService["getOverview"]>>).localRuntime?.status, "unchecked");
  assert.equal(localRuntimeCalls, 1);
});

test("overview service falls back when engine status probing is slow", async () => {
  class SlowStatusAdapter extends MockAdapter {
    override async status() {
      return new Promise<never>(() => {});
    }
  }

  const service = new OverviewService(
    new SlowStatusAdapter(),
    new StateStore(`/tmp/chillclaw-overview-engine-timeout-${randomUUID()}.json`)
  );

  const overview = await Promise.race([
    service.getOverview(),
    new Promise<"timeout">((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 900))
  ]);

  assert.notEqual(overview, "timeout");
  assert.match((overview as Awaited<ReturnType<OverviewService["getOverview"]>>).engine.summary, /still checking/i);
});

test("overview service falls back when runtime manager overview is slow", async () => {
  let runtimeManagerCalls = 0;
  const runtimeManager = {
    async getOverview() {
      runtimeManagerCalls += 1;
      return new Promise<never>(() => {});
    }
  } as Pick<RuntimeManager, "getOverview"> as RuntimeManager;
  const service = new OverviewService(
    new MockAdapter(),
    new StateStore(`/tmp/chillclaw-overview-runtime-manager-timeout-${randomUUID()}.json`),
    undefined,
    undefined,
    undefined,
    runtimeManager
  );

  const overview = await Promise.race([
    service.getOverview(),
    new Promise<"timeout">((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 900))
  ]);

  assert.notEqual(overview, "timeout");
  assert.equal(runtimeManagerCalls, 1);
  assert.equal((overview as Awaited<ReturnType<OverviewService["getOverview"]>>).runtimeManager.resources.length > 0, true);
});
