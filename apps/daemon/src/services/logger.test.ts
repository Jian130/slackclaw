import test from "node:test";
import assert from "node:assert/strict";

import { formatConsoleLine, logDevelopmentCommand } from "./logger.js";

test("console formatting includes the component and explicit scope when provided", () => {
  const line = formatConsoleLine("ChillClaw daemon listening on http://127.0.0.1:4545", {
    component: "ChillClaw daemon",
    scope: "index.serverListening"
  });

  assert.match(
    line,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ChillClaw daemon\]\[index\.serverListening\] ChillClaw daemon listening on http:\/\/127\.0\.0\.1:4545$/
  );
});

test("development command logging prefixes console output with an ISO timestamp", () => {
  const originalConsoleLog = console.log;
  const originalLogDevCommands = process.env.CHILLCLAW_LOG_DEV_COMMANDS;
  const lines: string[] = [];

  process.env.CHILLCLAW_LOG_DEV_COMMANDS = "1";
  console.log = (message?: unknown, ...rest: unknown[]) => {
    lines.push([message, ...rest].map((part) => String(part)).join(" "));
  };

  try {
    logDevelopmentCommand("openclaw.spawnCommand", "/opt/homebrew/bin/openclaw", ["status", "--json"]);
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
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ChillClaw daemon\]\[openclaw\.spawnCommand\] \/opt\/homebrew\/bin\/openclaw status --json$/
  );
});
