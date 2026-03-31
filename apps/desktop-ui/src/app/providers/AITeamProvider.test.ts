import { describe, expect, it } from "vitest";
import { shouldRefreshAITeamForEvent } from "./AITeamProvider.js";

describe("AITeamProvider helpers", () => {
  it("relies on direct ai-team snapshots instead of config refreshes", () => {
    expect(shouldRefreshAITeamForEvent()).toBe(false);
  });
});
