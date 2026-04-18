import { resolve } from "node:path";

export const DEV_RUNTIME_ENV = "CHILLCLAW_DEV_RUNTIME";
export const OPENCLAW_RUNTIME_PREFERENCE_ENV = "CHILLCLAW_OPENCLAW_RUNTIME_PREFERENCE";

const VALID_RUNTIME_MESSAGE =
  `${DEV_RUNTIME_ENV} must be one of: managed, managed-local, environment, system.`;

export function normalizeDevRuntimeMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized || normalized === "managed" || normalized === "managed-local") {
    return "managed-local";
  }

  if (normalized === "environment" || normalized === "system") {
    return "environment";
  }

  throw new Error(VALID_RUNTIME_MESSAGE);
}

export function createDevRuntimeConfig({ rootDir, env = process.env }) {
  const mode = normalizeDevRuntimeMode(env[DEV_RUNTIME_ENV]);

  if (mode === "managed-local") {
    return {
      mode,
      label: "managed ChillClaw OpenClaw runtime",
      extraEnv: {
        CHILLCLAW_DATA_DIR: resolve(rootDir, "apps/daemon/.data"),
        CHILLCLAW_RUNTIME_BUNDLE_DIR: resolve(rootDir, "runtime-artifacts"),
        HOME: resolve(rootDir, ".data/openclaw-home"),
        [OPENCLAW_RUNTIME_PREFERENCE_ENV]: "managed-local"
      }
    };
  }

  return {
    mode,
    label: "environment OpenClaw instance",
    extraEnv: {
      [OPENCLAW_RUNTIME_PREFERENCE_ENV]: "environment"
    }
  };
}

export async function prepareDevRuntime({ config, runBlockingStep, logStep }) {
  if (config.mode === "environment") {
    logStep("Using the environment OpenClaw instance for local debug.", { step: true });
    return;
  }

  logStep("Using the ChillClaw-managed OpenClaw runtime for local debug.");
  await runBlockingStep("Preparing managed OpenClaw runtime", "node", ["./scripts/prepare-dev-runtime.mjs"], config.extraEnv);
}
