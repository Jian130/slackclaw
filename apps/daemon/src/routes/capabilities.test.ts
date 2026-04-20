import test from "node:test";
import assert from "node:assert/strict";

import type { CapabilityOverview, ToolOverview } from "@chillclaw/contracts";

import { capabilityRoutes } from "./capabilities.js";
import type { ServerContext } from "./server-context.js";

const capabilityOverview: CapabilityOverview = {
  engine: "openclaw",
  checkedAt: "2026-04-20T00:00:00.000Z",
  entries: [],
  summary: "No capabilities found."
};

const toolOverview: ToolOverview = {
  engine: "openclaw",
  checkedAt: "2026-04-20T00:00:00.000Z",
  allow: [],
  deny: [],
  byProvider: {},
  entries: [],
  summary: "No tool policy configured."
};

test("capability routes return read-only capability and tool overviews", async () => {
  const capabilityRoute = capabilityRoutes.find((route) => route.method === "GET" && route.match("/api/capabilities/overview"));
  const toolRoute = capabilityRoutes.find((route) => route.method === "GET" && route.match("/api/tools/overview"));
  assert.ok(capabilityRoute);
  assert.ok(toolRoute);

  const context = {
    capabilityService: {
      getOverview: async () => capabilityOverview
    },
    toolService: {
      getOverview: async () => toolOverview
    }
  } as unknown as ServerContext;

  const capabilityResponse = await capabilityRoute.handle({
    context,
    request: {} as never,
    requestUrl: new URL("http://127.0.0.1/api/capabilities/overview"),
    pathname: "/api/capabilities/overview",
    params: {}
  });
  const toolResponse = await toolRoute.handle({
    context,
    request: {} as never,
    requestUrl: new URL("http://127.0.0.1/api/tools/overview"),
    pathname: "/api/tools/overview",
    params: {}
  });

  assert.equal((capabilityResponse.body as CapabilityOverview).engine, "openclaw");
  assert.equal((toolResponse.body as ToolOverview).engine, "openclaw");
});
