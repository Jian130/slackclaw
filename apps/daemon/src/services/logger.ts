import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { getAppRootDir, getLogDir } from "../runtime-paths.js";

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

export function shouldLogDevelopmentCommands(): boolean {
  if (process.env.SLACKCLAW_LOG_DEV_COMMANDS === "0") {
    return false;
  }

  return process.env.SLACKCLAW_LOG_DEV_COMMANDS === "1" || !getAppRootDir();
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function logDevelopmentCommand(scope: string, command: string, args: string[] = []): void {
  if (!shouldLogDevelopmentCommands()) {
    return;
  }

  const renderedArgs = args.map((arg) => shellQuote(arg)).join(" ");
  console.log(`[SlackClaw daemon][${scope}] ${command}${args.length > 0 ? ` ${renderedArgs}` : ""}`);
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
