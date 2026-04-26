import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readRepoFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("local macOS install reuses checked-in runtime artifacts when the prepare helper is absent", async () => {
  const installScript = await readRepoFile("scripts/install-local-macos.sh");

  assert.match(installScript, /PREPARE_RUNTIME_SCRIPT=/);
  assert.match(installScript, /\[\[ -f "\$PREPARE_RUNTIME_SCRIPT" \]\]/);
  assert.match(installScript, /reusing existing runtime-artifacts directory/);
  assert.match(installScript, /npm run prepare:runtime-artifacts/);
});
