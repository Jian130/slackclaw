#!/usr/bin/env node

import { getDevProcessStatePath, stopManagedProcesses } from "./dev-process-control.mjs";

function log(message) {
  console.log(`[SlackClaw stop] ${message}`);
}

async function main() {
  const result = await stopManagedProcesses();

  if (result.stopped.length === 0) {
    log(`No managed SlackClaw dev processes were running. State file: ${getDevProcessStatePath()}`);
    return;
  }

  const summary = result.stopped.map((entry) => `${entry.name}(${entry.pid})`).join(", ");
  log(`Stopped ${summary}.`);
}

await main();
