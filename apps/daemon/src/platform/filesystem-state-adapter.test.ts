import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { FilesystemStateAdapter } from "./filesystem-state-adapter.js";

test("filesystem state adapter reads, writes, and creates parent directories", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "chillclaw-filesystem-state-"));
  const adapter = new FilesystemStateAdapter();
  const statePath = resolve(root, "nested", "state.json");
  const logPath = resolve(root, "logs", "error.log");

  try {
    const fallback = { tasks: [] as string[] };

    assert.deepEqual(await adapter.readJson(statePath, fallback), fallback);

    await adapter.writeJson(statePath, {
      selectedProfileId: "profile-1",
      tasks: ["deploy"]
    });

    assert.deepEqual(await adapter.readJson(statePath, fallback), {
      selectedProfileId: "profile-1",
      tasks: ["deploy"]
    });

    await adapter.appendLog(logPath, "first line\n");
    await adapter.appendLog(logPath, "second line\n");

    assert.equal(await readFile(logPath, "utf8"), "first line\nsecond line\n");
    assert.equal(dirname(statePath).endsWith("nested"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
