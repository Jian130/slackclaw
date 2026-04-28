import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createDefaultProductOverview } from "@chillclaw/contracts";

import { MockAdapter } from "../engine/mock-adapter.js";
import { EventBusService } from "./event-bus-service.js";
import { EventPublisher } from "./event-publisher.js";
import { OverviewService } from "./overview-service.js";
import { SetupService } from "./setup-service.js";
import { StateStore } from "./state-store.js";

function createService(testName: string) {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/${testName}-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);

  return {
    store,
    service: new SetupService(adapter, store, overviewService)
  };
}

test("first-run install no longer marks the whole onboarding flow complete", async () => {
  const { service, store } = createService("setup-service-onboarding");

  const result = await service.runFirstRunSetup();
  const state = await store.read();

  assert.equal(result.status, "completed");
  assert.equal(Boolean(result.install?.engineStatus.installed), true);
  assert.equal(Boolean(state.introCompletedAt), true);
  assert.equal(state.setupCompletedAt, undefined);
  assert.equal(result.overview.firstRun.setupCompleted, false);
  assert.equal(result.steps.some((step) => step.id === "install-preset-skills"), false);
});

test("first-run setup defaults to the managed local OpenClaw runtime", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/setup-service-managed-local-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const service = new SetupService(adapter, store, overviewService);
  let installOptions: { forceLocal?: boolean } | undefined;

  adapter.install = async (_autoConfigure = true, options?: { forceLocal?: boolean }) => {
    installOptions = options;
    return {
      status: "installed",
      message: "Mock OpenClaw runtime is deployed and ready for onboarding.",
      engineStatus: await adapter.status()
    };
  };

  await service.runFirstRunSetup();

  assert.equal(installOptions?.forceLocal, true);
});

test("first-run setup returns a lightweight overview without model-runtime probing", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/setup-service-lightweight-overview-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  let includeLocalRuntime: boolean | undefined;
  const overviewService = {
    async getOverview(options?: { includeLocalRuntime?: boolean }) {
      includeLocalRuntime = options?.includeLocalRuntime;
      return createDefaultProductOverview();
    }
  } as OverviewService;
  const service = new SetupService(adapter, store, overviewService);

  const result = await service.runFirstRunSetup();

  assert.equal(result.status, "completed");
  assert.equal(includeLocalRuntime, false);
  assert.equal(result.overview.localRuntime?.status, "unchecked");
});

test("first-run setup returns after install when the follow-up overview hangs", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/setup-service-overview-hangs-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = {
    async getOverview() {
      return new Promise<ReturnType<typeof createDefaultProductOverview>>(() => undefined);
    }
  } as OverviewService;
  const service = new SetupService(adapter, store, overviewService);

  const result = await Promise.race([
    service.runFirstRunSetup(),
    new Promise<"timeout">((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 1_500))
  ]);

  assert.notEqual(result, "timeout");
  const setup = result as Awaited<ReturnType<typeof service.runFirstRunSetup>>;
  assert.equal(setup.status, "completed");
  assert.equal(setup.overview.firstRun.setupCompleted, false);
  assert.equal(setup.overview.engine.installed, true);
});

test("first-run setup publishes deploy progress and completion events", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/setup-service-events-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  const bus = new EventBusService();
  const service = new SetupService(adapter, store, overviewService, new EventPublisher(bus));
  const events: Array<{ type: string; phase?: string }> = [];
  const unsubscribe = bus.subscribe((event) => {
    events.push({
      type: event.type,
      phase: event.type === "deploy.progress" ? event.phase : undefined
    });
  });

  await service.runFirstRunSetup();
  unsubscribe();

  assert.deepEqual(events, [
    { type: "deploy.progress", phase: "detecting" },
    { type: "deploy.progress", phase: "reusing" },
    { type: "deploy.progress", phase: "verifying" },
    { type: "deploy.completed", phase: undefined }
  ]);
});

test("first-run setup ignores onboarding preset skill reconcile work", async () => {
  const filePath = resolve(process.cwd(), `apps/daemon/.data/setup-service-preset-sync-${randomUUID()}.json`);
  const adapter = new MockAdapter();
  const store = new StateStore(filePath);
  const overviewService = new OverviewService(adapter, store);
  await store.update((current) => ({
    ...current,
    onboarding: {
      draft: {
        currentStep: "employee",
        install: {
          installed: true,
          disposition: "installed-managed"
        },
        employee: {
          presetId: "guided",
          avatarPresetId: "operator",
          name: "Research Helper",
          jobTitle: "Researcher",
          presetSkillIds: ["research-brief"]
        }
      }
    }
  }));

  const service = new SetupService(adapter, store, overviewService);

  const result = await service.runFirstRunSetup();

  assert.equal(result.status, "completed");
  assert.equal(result.steps.some((step) => step.id === "install-preset-skills"), false);
});
