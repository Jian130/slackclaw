import type { RouteDefinition, RouteParams } from "./types.js";

import { capabilityRoutes } from "./capabilities.js";
import { catalogRoutes } from "./catalog.js";
import { channelsRoutes } from "./channels.js";
import { chatRoutes } from "./chat.js";
import { downloadsRoutes } from "./downloads.js";
import { modelsRoutes } from "./models.js";
import { onboardingRoutes } from "./onboarding.js";
import { runtimeRoutes } from "./runtime.js";
import { systemRoutes } from "./system.js";

export const routeDefinitions: RouteDefinition[] = [
  ...systemRoutes,
  ...downloadsRoutes,
  ...modelsRoutes,
  ...runtimeRoutes,
  ...onboardingRoutes,
  ...channelsRoutes,
  ...capabilityRoutes,
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
