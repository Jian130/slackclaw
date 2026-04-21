import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { PluginConfigOverview } from "@chillclaw/contracts";

import type { SkillRuntimeCatalog } from "../engine/adapter.js";
import { MockAdapter } from "../engine/mock-adapter.js";
import { CapabilityService } from "./capability-service.js";
import { StateStore } from "./state-store.js";

const skillCatalog: SkillRuntimeCatalog = {
  workspaceDir: "/mock/openclaw/workspace",
  managedSkillsDir: "/mock/openclaw/workspace/skills",
  marketplaceAvailable: true,
  marketplaceSummary: "Mock marketplace available.",
  readiness: {
    total: 4,
    eligible: 1,
    disabled: 1,
    blocked: 1,
    missing: 1,
    warnings: [],
    summary: "1 ready · 3 need attention"
  },
  skills: [
    {
      id: "research-brief",
      slug: "research-brief",
      name: "Research Brief",
      description: "Create concise research summaries.",
      source: "openclaw-workspace",
      bundled: true,
      eligible: true,
      disabled: false,
      blockedByAllowlist: false,
      missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
      version: "1.0.0"
    },
    {
      id: "status-writer",
      slug: "status-writer",
      name: "Status Writer",
      description: "Write status updates.",
      source: "openclaw-workspace",
      bundled: true,
      eligible: true,
      disabled: true,
      blockedByAllowlist: false,
      missing: { bins: [], anyBins: [], env: [], config: [], os: [] }
    },
    {
      id: "weather",
      slug: "weather",
      name: "Weather",
      description: "Weather forecasts.",
      source: "openclaw-bundled",
      bundled: true,
      eligible: true,
      disabled: false,
      blockedByAllowlist: true,
      missing: { bins: [], anyBins: [], env: [], config: [], os: [] }
    },
    {
      id: "slack",
      slug: "slack",
      name: "Slack",
      description: "Slack operations.",
      source: "openclaw-bundled",
      bundled: true,
      eligible: false,
      disabled: false,
      blockedByAllowlist: false,
      missing: { bins: [], anyBins: [], env: [], config: ["channels.slack"], os: [] }
    }
  ]
};

const pluginOverview: PluginConfigOverview = {
  entries: [
    {
      id: "wecom",
      label: "WeCom Plugin",
      packageSpec: "@wecom/wecom-openclaw-plugin",
      runtimePluginId: "wecom-openclaw-plugin",
      configKey: "wecom",
      status: "ready",
      summary: "Plugin is ready.",
      detail: "Managed by ChillClaw.",
      enabled: true,
      installed: true,
      hasUpdate: false,
      hasError: false,
      activeDependentCount: 0,
      dependencies: []
    },
    {
      id: "broken-plugin",
      label: "Broken Plugin",
      packageSpec: "broken",
      runtimePluginId: "broken",
      configKey: "broken",
      status: "error",
      summary: "Plugin failed to load.",
      detail: "Load error.",
      enabled: false,
      installed: true,
      hasUpdate: false,
      hasError: true,
      activeDependentCount: 0,
      dependencies: []
    }
  ]
};

class CapabilityFixtureAdapter extends MockAdapter {
  override readonly tools = {
    getRuntimeToolAccess: async () => ({
      engine: "openclaw" as const,
      allow: ["group:web"],
      deny: ["openclaw.exec"],
      byProvider: {},
      entries: [
        { id: "group:web", kind: "tool-group" as const, label: "Web" },
        { id: "openclaw.exec", kind: "tool" as const, label: "openclaw.exec" },
        { id: "group:automation", kind: "tool-group" as const, label: "Automation" }
      ]
    })
  };

  override async getSkillRuntimeCatalog() {
    return skillCatalog;
  }

  override async getPluginConfigOverview() {
    return pluginOverview;
  }
}

class FeaturePreparationAdapter extends MockAdapter {
  ensureCalls: Array<{ featureId: string; deferGatewayRestart?: boolean }> = [];

  override async ensureFeatureRequirements(featureId: string, options?: { deferGatewayRestart?: boolean }) {
    this.ensureCalls.push({ featureId, deferGatewayRestart: options?.deferGatewayRestart });
    return pluginOverview;
  }
}

test("capability service aggregates skill plugin and tool readiness", async () => {
  const service = new CapabilityService(new CapabilityFixtureAdapter());

  const overview = await service.getOverview();

  assert.equal(overview.engine, "openclaw");
  assert.equal(overview.entries.find((entry) => entry.id === "research-brief")?.status, "ready");
  assert.equal(overview.entries.find((entry) => entry.id === "status-writer")?.status, "disabled");
  assert.equal(overview.entries.find((entry) => entry.id === "weather")?.status, "blocked");
  assert.equal(overview.entries.find((entry) => entry.id === "slack")?.status, "missing");
  assert.equal(overview.entries.find((entry) => entry.id === "wecom-openclaw-plugin")?.status, "ready");
  assert.equal(overview.entries.find((entry) => entry.id === "broken")?.status, "error");
  assert.equal(overview.entries.find((entry) => entry.id === "openclaw.exec")?.status, "blocked");
  assert.equal(overview.entries.find((entry) => entry.kind === "preset" && entry.id === "research-analyst")?.status, "disabled");
});

test("capability service prepares managed channel feature requirements", async () => {
  const adapter = new FeaturePreparationAdapter();
  const service = new CapabilityService(adapter);

  const result = await service.prepareFeature("channel:wechat-work");

  assert.equal(result.feature.id, "channel:wechat-work");
  assert.deepEqual(adapter.ensureCalls, [{ featureId: "channel:wechat-work", deferGatewayRestart: true }]);
  assert.equal(result.pluginConfig, pluginOverview);
  assert.deepEqual(result.prerequisites, [
    {
      type: "openclaw-plugin",
      status: "ready",
      pluginId: "wecom",
      displayName: "WeCom Plugin"
    }
  ]);
});

test("capability service queues external installer prerequisites", async () => {
  const adapter = new FeaturePreparationAdapter();
  const service = new CapabilityService(adapter);

  const result = await service.prepareChannel("wechat");

  assert.equal(result?.feature.id, "channel:wechat");
  assert.deepEqual(adapter.ensureCalls, []);
  assert.deepEqual(result?.prerequisites, [
    {
      type: "external-installer",
      status: "queued",
      installerId: "openclaw-weixin",
      displayName: "Personal WeChat login",
      command: ["openclaw", "channels", "login", "--channel", "openclaw-weixin"]
    }
  ]);
});

test("capability service syncs selected preset skills as compatibility state", async () => {
  const adapter = new CapabilityFixtureAdapter();
  const store = new StateStore(resolve(process.cwd(), `apps/daemon/.data/capability-service-preset-sync-${randomUUID()}.json`));
  const service = new CapabilityService(adapter, undefined, store);

  const overview = await service.setDesiredPresetSkillIds("onboarding", ["research-brief"], {
    waitForReconcile: false
  });
  const persisted = await store.read();

  assert.equal(overview.entries[0]?.presetSkillId, "research-brief");
  assert.equal(overview.entries[0]?.status, "pending");
  assert.equal(persisted.presetSkills?.selections.onboarding?.presetSkillIds[0], "research-brief");
  assert.equal((await service.getPresetSkillSyncOverview()).entries[0]?.presetSkillId, "research-brief");
});
