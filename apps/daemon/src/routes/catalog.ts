import { jsonResponse } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

const matchMarketplaceDetail = createPathMatcher("/api/skills/marketplace/:slug");
const matchInstalledSkillDetail = createPathMatcher("/api/skills/:skillId");

export const catalogRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/skills/marketplace/explore"),
    async handle({ context }) {
      return jsonResponse(await context.adapter.config.exploreSkillMarketplace(10));
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/skills/marketplace/search"),
    async handle({ context, requestUrl }) {
      return jsonResponse(await context.skillService.searchMarketplace(requestUrl.searchParams.get("q") ?? ""));
    }
  },
  {
    method: "GET",
    match: matchMarketplaceDetail,
    async handle({ context, params }) {
      return jsonResponse(await context.skillService.getMarketplaceDetail(params.slug));
    }
  },
  {
    method: "GET",
    match: matchInstalledSkillDetail,
    async handle({ context, params }) {
      return jsonResponse(await context.skillService.getInstalledSkillDetail(params.skillId));
    }
  }
];
