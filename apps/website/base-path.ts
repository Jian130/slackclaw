export function resolveBasePath(env: Record<string, string | undefined>): string {
  const explicit = env.VITE_BASE_PATH?.trim();
  if (explicit) {
    return normalizeBasePath(explicit);
  }

  if (env.GITHUB_ACTIONS === "true") {
    const repository = env.GITHUB_REPOSITORY?.split("/")[1] ?? "chillclaw";
    return `/${repository}/`;
  }

  return "/";
}

function normalizeBasePath(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
