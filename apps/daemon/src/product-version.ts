import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let cachedProductVersion: string | undefined;

export function getProductVersion(): string {
  const explicitVersion = process.env.CHILLCLAW_APP_VERSION?.trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  if (cachedProductVersion) {
    return cachedProductVersion;
  }

  try {
    const sourceDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = resolve(sourceDir, "../../../package.json");
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    cachedProductVersion = parsed.version?.trim() || "0.0.0";
    return cachedProductVersion;
  } catch {
    cachedProductVersion = "0.0.0";
    return cachedProductVersion;
  }
}
