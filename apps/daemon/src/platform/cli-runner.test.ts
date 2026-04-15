import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveCommandFromPath, runCommand } from "./cli-runner.js";

test("runCommand captures stdout and stderr and allows non-zero exits when requested", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-cli-runner-test-"));
  const scriptPath = join(tempDir, "command.sh");

  await writeFile(
    scriptPath,
    `#!/bin/sh
echo "hello"
echo "problem" >&2
exit 7
`
  );
  await chmod(scriptPath, 0o755);

  try {
    const result = await runCommand(scriptPath, [], { allowFailure: true, env: process.env });

    assert.equal(result.code, 7);
    assert.equal(result.stdout, "hello");
    assert.equal(result.stderr, "problem");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("runCommand reports a signal when a command is terminated by macOS", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-cli-runner-signal-test-"));
  const scriptPath = join(tempDir, "command.sh");

  await writeFile(
    scriptPath,
    `#!/bin/sh
kill -TERM $$
`
  );
  await chmod(scriptPath, 0o755);

  try {
    const result = await runCommand(scriptPath, [], { allowFailure: true, env: process.env });

    assert.equal(result.code, 1);
    assert.equal(result.signal, "SIGTERM");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolveCommandFromPath respects the provided PATH", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-cli-runner-path-test-"));
  const commandPath = join(tempDir, "fake-command");

  await writeFile(
    commandPath,
    `#!/bin/sh
echo "fake"
`
  );
  await chmod(commandPath, 0o755);

  try {
    const resolved = await resolveCommandFromPath("fake-command", {
      env: {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH ?? ""}`
      }
    });

    assert.equal(resolved, commandPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
