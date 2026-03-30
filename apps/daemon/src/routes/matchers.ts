import type { RouteParams } from "./types.js";

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

export function createPathMatcher(pattern: string) {
  const patternSegments = splitPath(pattern);

  return (pathname: string): RouteParams | undefined => {
    const pathSegments = splitPath(pathname);
    if (pathSegments.length !== patternSegments.length) {
      return undefined;
    }

    const params: RouteParams = {};

    for (let index = 0; index < patternSegments.length; index += 1) {
      const expected = patternSegments[index];
      const actual = pathSegments[index];

      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        continue;
      }

      if (expected !== actual) {
        return undefined;
      }
    }

    return params;
  };
}
