import test from "node:test";
import assert from "node:assert/strict";

import { buildReadableMemberAgentId, resolveReadableMemberAgentId } from "./member-agent-id.js";

test("buildReadableMemberAgentId uses a readable name slug and local timestamp", () => {
  const agentId = buildReadableMemberAgentId("Alex Morgan", new Date(2026, 2, 15, 13, 42, 9));

  assert.equal(agentId, "chillclaw-member-alex-morgan-20260315-134209");
});

test("buildReadableMemberAgentId falls back cleanly when the name has no ascii slug", () => {
  const agentId = buildReadableMemberAgentId("小红书", new Date(2026, 2, 15, 8, 5, 4));

  assert.equal(agentId, "chillclaw-member-member-20260315-080504");
});

test("resolveReadableMemberAgentId adds a readable suffix when the base id is already taken", () => {
  const agentId = resolveReadableMemberAgentId(
    "Alex Morgan",
    ["chillclaw-member-alex-morgan-20260315-134209"],
    new Date(2026, 2, 15, 13, 42, 9)
  );

  assert.equal(agentId, "chillclaw-member-alex-morgan-20260315-134209-2");
});
