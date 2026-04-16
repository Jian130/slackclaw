import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  availableBytesFromDfOutput,
  getAvailableDiskBytes,
  resolveDiskProbePath
} from "./disk-space.js";

test("availableBytesFromDfOutput parses POSIX df output", () => {
  const output = [
    "Filesystem 1024-blocks Used Available Capacity Mounted on",
    "/dev/disk3s1 976490576 381331296 592623136 40% /System/Volumes/Data"
  ].join("\n");

  assert.equal(availableBytesFromDfOutput(output), 592_623_136 * 1024);
});

test("getAvailableDiskBytes probes the nearest existing parent with df", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "chillclaw-disk-space-"));
  const existingParent = resolve(root, "data");
  const missingTarget = resolve(existingParent, "ollama-runtime", "models");
  await mkdir(existingParent, { recursive: true });

  const availableBytes = await getAvailableDiskBytes(missingTarget, {
    runCommand: async (command, args) => {
      assert.equal(command, "df");
      assert.deepEqual(args, ["-Pk", existingParent]);
      return "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk 20 4 16 20% /tmp\n";
    }
  });

  assert.equal(availableBytes, 16 * 1024);
});

test("resolveDiskProbePath falls back to the nearest existing parent", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "chillclaw-disk-space-probe-"));
  const existingParent = resolve(root, "daemon-data");
  const missingTarget = resolve(existingParent, "downloads", "cache");
  await mkdir(existingParent, { recursive: true });

  const resolvedPath = await resolveDiskProbePath(missingTarget);

  assert.equal(resolvedPath, existingParent);
});
