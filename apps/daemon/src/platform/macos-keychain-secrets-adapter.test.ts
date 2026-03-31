import assert from "node:assert/strict";
import test from "node:test";

import { MacOSKeychainSecretsAdapter } from "./macos-keychain-secrets-adapter.js";

test("macOS keychain adapter can no-op safely when keychain is unavailable in tests", async () => {
  const calls: string[][] = [];
  const adapter = new MacOSKeychainSecretsAdapter("ai.chillclaw.test", async (args) => {
    calls.push(args);
    return {
      code: 127,
      stdout: "",
      stderr: "security: command not found"
    };
  });

  await adapter.set("chillclaw.channel.telegram.default.token", "123456:AA-test");
  assert.equal(await adapter.get("chillclaw.channel.telegram.default.token"), undefined);
  await adapter.delete("chillclaw.channel.telegram.default.token");

  assert.deepEqual(calls, [
    ["add-generic-password", "-U", "-a", "chillclaw.channel.telegram.default.token", "-s", "ai.chillclaw.test", "-w", "123456:AA-test"],
    ["find-generic-password", "-a", "chillclaw.channel.telegram.default.token", "-s", "ai.chillclaw.test", "-w"],
    ["delete-generic-password", "-a", "chillclaw.channel.telegram.default.token", "-s", "ai.chillclaw.test"]
  ]);
});
