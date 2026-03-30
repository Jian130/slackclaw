import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InstalledSkillEntry } from "@slackclaw/contracts";

import {
  filterMarketplaceSearchResults,
  presetSyncCounts,
  SkillReadinessBadge,
  skillMissingSummary,
  skillReadinessTone,
  skillSourceLabel
} from "./SkillsPage.js";

const baseSkill: InstalledSkillEntry = {
  id: "weather",
  slug: "weather",
  name: "Weather",
  description: "Get weather details.",
  source: "clawhub",
  bundled: false,
  eligible: true,
  disabled: false,
  blockedByAllowlist: false,
  readiness: "ready",
  missing: {
    bins: [],
    anyBins: [],
    env: [],
    config: [],
    os: []
  },
  homepage: "https://example.com/weather",
  version: "1.0.0",
  managedBy: "clawhub",
  editable: false,
  removable: true,
  updatable: true
};

describe("SkillsPage helpers", () => {
  it("maps installed skill sources to stable labels", () => {
    expect(skillSourceLabel(baseSkill)).toBe("ClawHub");
    expect(skillSourceLabel({ ...baseSkill, source: "custom" })).toBe("Custom");
    expect(skillSourceLabel({ ...baseSkill, source: "bundled" })).toBe("Bundled");
  });

  it("maps readiness to the expected badge tone", () => {
    expect(skillReadinessTone(baseSkill)).toBe("success");
    expect(skillReadinessTone({ ...baseSkill, readiness: "missing" })).toBe("warning");
    expect(skillReadinessTone({ ...baseSkill, readiness: "blocked" })).toBe("neutral");
  });

  it("summarizes missing requirements for non-ready skills", () => {
    expect(
      skillMissingSummary({
        ...baseSkill,
        readiness: "missing",
        missing: {
          bins: ["python3"],
          anyBins: [],
          env: ["OPENWEATHER_API_KEY"],
          config: [],
          os: []
        }
      })
    ).toBe("bins: python3 · env: OPENWEATHER_API_KEY");
  });

  it("filters marketplace search results down to uninstalled unique skills", () => {
    expect(
      filterMarketplaceSearchResults([
        { slug: "weather-api", name: "Weather API", summary: "Weather", installed: false, curated: true },
        { slug: "weather-api", name: "Weather API", summary: "Duplicate", installed: false, curated: false },
        { slug: "slack-sync", name: "Slack Sync", summary: "Sync", installed: true, curated: false }
      ])
    ).toEqual([
      { slug: "weather-api", name: "Weather API", summary: "Weather", installed: false, curated: true }
    ]);
  });

  it("summarizes preset skill sync entries for the dashboard card", () => {
    expect(
      presetSyncCounts({
        targetMode: "reused-install",
        summary: "Repair needed",
        repairRecommended: true,
        entries: [
          {
            presetSkillId: "research",
            runtimeSlug: "research",
            targetMode: "reused-install",
            status: "verified",
            updatedAt: "2026-03-27T00:00:00.000Z"
          },
          {
            presetSkillId: "notes",
            runtimeSlug: "notes",
            targetMode: "reused-install",
            status: "pending",
            updatedAt: "2026-03-27T00:00:00.000Z"
          },
          {
            presetSkillId: "finance",
            runtimeSlug: "finance",
            targetMode: "reused-install",
            status: "failed",
            updatedAt: "2026-03-27T00:00:00.000Z"
          }
        ]
      })
    ).toEqual({
      verified: 1,
      pending: 1,
      failed: 1
    });
  });

  it("renders readiness through StatusBadge semantics", () => {
    const html = renderToStaticMarkup(<SkillReadinessBadge skill={{ ...baseSkill, readiness: "missing" }} />);

    expect(html).toContain("badge--status");
    expect(html).toContain("badge--warning");
    expect(html).toContain("Needs setup");
  });
});
