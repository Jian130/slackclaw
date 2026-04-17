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

test("runCommand waits for stdio to close before returning captured output", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-cli-runner-stdio-test-"));
  const scriptPath = join(tempDir, "write-output.mjs");
  const stdoutText = "x".repeat(256 * 1024);
  const stderrText = "y".repeat(128 * 1024);

  await writeFile(
    scriptPath,
    `process.stdout.write("x".repeat(256 * 1024));
process.stderr.write("y".repeat(128 * 1024));
`
  );

  try {
    const result = await runCommand(process.execPath, [scriptPath], { allowFailure: true, env: process.env });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, stdoutText);
    assert.equal(result.stderr, stderrText);
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

test("runCommand times out, terminates the child, and preserves partial output", async () => {
  const tempDir = await mkdtemp(resolve(tmpdir(), "chillclaw-cli-runner-timeout-test-"));
  const scriptPath = join(tempDir, "timeout.mjs");

  await writeFile(
    scriptPath,
    `process.stdout.write("started");
process.stderr.write("still working");
setTimeout(() => {}, 60_000);
`
  );

  try {
    await assert.rejects(
      () => runCommand(process.execPath, [scriptPath], {
        allowFailure: true,
        env: process.env,
        timeoutMs: 200,
        killTimeoutMs: 20
      }),
      (error) => {
        const timeout = error as { code?: string; stdout?: string; stderr?: string; timedOut?: boolean };
        assert.equal(timeout.code, "COMMAND_TIMEOUT");
        assert.equal(timeout.timedOut, true);
        assert.equal(timeout.stdout, "started");
        assert.equal(timeout.stderr, "still working");
        return true;
      }
    );
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
