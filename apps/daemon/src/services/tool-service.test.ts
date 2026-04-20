import test from "node:test";
import assert from "node:assert/strict";

import type { EngineAdapter, RuntimeToolAccess } from "../engine/adapter.js";
import { ToolService } from "./tool-service.js";

function adapterWithToolAccess(access: RuntimeToolAccess): EngineAdapter {
  return {
    capabilities: {
      engine: "openclaw",
      supportsInstall: true,
      supportsUpdate: true,
      supportsRecovery: true,
      supportsStreaming: true,
      runtimeModes: ["gateway"],
      supportedChannels: [],
      starterSkillCategories: [],
      futureLocalModelFamilies: []
    },
    tools: {
      getRuntimeToolAccess: async () => access
    }
  } as unknown as EngineAdapter;
}

test("tool service marks globally allowed and denied OpenClaw tools", async () => {
  const service = new ToolService(adapterWithToolAccess({
    engine: "openclaw",
    profile: "default",
    allow: ["group:web"],
    deny: ["openclaw.exec"],
    byProvider: {
      openai: {
        deny: ["group:runtime"]
      }
    },
    entries: [
      {
        id: "group:web",
        kind: "tool-group",
        label: "Web"
      },
      {
        id: "openclaw.exec",
        kind: "tool",
        label: "openclaw.exec"
      },
      {
        id: "group:automation",
        kind: "tool-group",
        label: "Automation"
      }
    ]
  }));

  const overview = await service.getOverview();

  assert.equal(overview.entries.find((entry) => entry.id === "group:web")?.status, "ready");
  assert.equal(overview.entries.find((entry) => entry.id === "openclaw.exec")?.status, "blocked");
  assert.equal(overview.entries.find((entry) => entry.id === "group:automation")?.status, "unknown");
  assert.equal(overview.byProvider.openai?.deny?.[0], "group:runtime");
});

test("tool service treats OpenClaw profiles as base tool coverage before allow deny overrides", async () => {
  const service = new ToolService(adapterWithToolAccess({
    engine: "openclaw",
    profile: "coding",
    allow: ["group:messaging"],
    deny: ["group:runtime"],
    byProvider: {},
    entries: [
      {
        id: "group:web",
        kind: "tool-group",
        label: "Web"
      },
      {
        id: "group:runtime",
        kind: "tool-group",
        label: "Runtime"
      },
      {
        id: "group:messaging",
        kind: "tool-group",
        label: "Messaging"
      },
      {
        id: "session_status",
        kind: "tool",
        label: "Session Status"
      }
    ]
  }));

  const overview = await service.getOverview();

  assert.equal(overview.entries.find((entry) => entry.id === "group:web")?.status, "ready");
  assert.equal(overview.entries.find((entry) => entry.id === "group:runtime")?.status, "blocked");
  assert.equal(overview.entries.find((entry) => entry.id === "group:messaging")?.status, "ready");
  assert.equal(overview.entries.find((entry) => entry.id === "session_status")?.status, "unknown");
});

test("tool service treats full and missing OpenClaw profiles as unrestricted", async () => {
  const service = new ToolService(adapterWithToolAccess({
    engine: "openclaw",
    allow: [],
    deny: [],
    byProvider: {},
    entries: [
      {
        id: "group:media",
        kind: "tool-group",
        label: "Media"
      }
    ]
  }));

  const overview = await service.getOverview();

  assert.equal(overview.entries.find((entry) => entry.id === "group:media")?.status, "ready");
});
