#!/usr/bin/env node

import { getDevProcessStatePath, stopManagedProcesses } from "./dev-process-control.mjs";
import { writeScriptLogLine } from "./logging.mjs";

const SCRIPT_LABEL = "ChillClaw stop";

function log(message) {
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "stop-dev.main",
    message
  });
}

async function main() {
  const result = await stopManagedProcesses();

  if (result.stopped.length === 0) {
    log(`No managed ChillClaw dev processes were running. State file: ${getDevProcessStatePath()}`);
    return;
  }

  const summary = result.stopped.map((entry) => `${entry.name}(${entry.pid})`).join(", ");
  log(`Stopped ${summary}.`);
}

await main();
