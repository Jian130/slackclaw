import assert from "node:assert/strict";
import test from "node:test";

import { formatScriptLogLine } from "./logging.mjs";

test("script log lines include the script label and scope", () => {
  const line = formatScriptLogLine({
    label: "ChillClaw start",
    scope: "start-dev.logStep",
    message: "Starting ChillClaw local development environment"
  });

  assert.match(
    line,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ChillClaw start\]\[start-dev\.logStep\] Starting ChillClaw local development environment$/
  );
});

test("script log lines keep optional message prefixes inside the message body", () => {
  const line = formatScriptLogLine({
    label: "ChillClaw start",
    scope: "start-dev.logStep",
    message: "01. Checking local JavaScript dependencies"
  });

  assert.match(
    line,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ChillClaw start\]\[start-dev\.logStep\] 01\. Checking local JavaScript dependencies$/
  );
});
