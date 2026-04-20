import { jsonResponse } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

export const capabilityRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/capabilities/overview"),
    freshReadInvalidationTargets: ["skills", "plugins", "tools"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.capabilityService.getOverview());
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/tools/overview"),
    freshReadInvalidationTargets: ["tools"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.toolService.getOverview());
    }
  }
];
