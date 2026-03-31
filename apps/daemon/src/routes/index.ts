import type { RouteDefinition, RouteParams } from "./types.js";

import { catalogRoutes } from "./catalog.js";
import { channelsRoutes } from "./channels.js";
import { chatRoutes } from "./chat.js";
import { modelsRoutes } from "./models.js";
import { onboardingRoutes } from "./onboarding.js";
import { systemRoutes } from "./system.js";

export const routeDefinitions: RouteDefinition[] = [
  ...systemRoutes,
  ...modelsRoutes,
  ...onboardingRoutes,
  ...channelsRoutes,
  ...catalogRoutes,
  ...chatRoutes
];

export function findRouteDefinition(method: string, pathname: string): { route: RouteDefinition; params: RouteParams } | undefined {
  for (const route of routeDefinitions) {
    if (route.method !== method) {
      continue;
    }

    const params = route.match(pathname);
    if (params) {
      return { route, params };
    }
  }

  return undefined;
}
