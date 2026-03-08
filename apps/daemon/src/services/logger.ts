import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { getLogDir } from "../runtime-paths.js";

const ERROR_LOG_PATH = resolve(getLogDir(), "error.log");

function formatMessage(level: "INFO" | "ERROR", message: string, details?: unknown): string {
  const payload =
    details === undefined
      ? ""
      : ` ${typeof details === "string" ? details : JSON.stringify(details, null, 2)}`;

  return `${new Date().toISOString()} [${level}] ${message}${payload}\n`;
}

export async function writeErrorLog(message: string, details?: unknown): Promise<void> {
  try {
    await mkdir(getLogDir(), { recursive: true });
    await appendFile(ERROR_LOG_PATH, formatMessage("ERROR", message, details), "utf8");
  } catch {
    // Logging must never crash the app.
  }
}

export async function writeInfoLog(message: string, details?: unknown): Promise<void> {
  try {
    await mkdir(getLogDir(), { recursive: true });
    await appendFile(ERROR_LOG_PATH, formatMessage("INFO", message, details), "utf8");
  } catch {
    // Logging must never crash the app.
  }
}

export function errorToLogDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    value: String(error)
  };
}
