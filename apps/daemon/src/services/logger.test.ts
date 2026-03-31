import test from "node:test";
import assert from "node:assert/strict";

import { logDevelopmentCommand } from "./logger.js";

test("development command logging prefixes console output with an ISO timestamp", () => {
  const originalConsoleLog = console.log;
  const originalLogDevCommands = process.env.CHILLCLAW_LOG_DEV_COMMANDS;
  const lines: string[] = [];

  process.env.CHILLCLAW_LOG_DEV_COMMANDS = "1";
  console.log = (message?: unknown, ...rest: unknown[]) => {
    lines.push([message, ...rest].map((part) => String(part)).join(" "));
  };

  try {
    logDevelopmentCommand("openclaw", "/opt/homebrew/bin/openclaw", ["status", "--json"]);
  } finally {
    console.log = originalConsoleLog;
    if (originalLogDevCommands === undefined) {
      delete process.env.CHILLCLAW_LOG_DEV_COMMANDS;
    } else {
      process.env.CHILLCLAW_LOG_DEV_COMMANDS = originalLogDevCommands;
    }
  }

  assert.equal(lines.length, 1);
  assert.match(
    lines[0] ?? "",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ChillClaw daemon\]\[openclaw\] \/opt\/homebrew\/bin\/openclaw status --json$/
  );
});
