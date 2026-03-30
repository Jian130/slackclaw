import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildMemberPresetDraft, MemberStatusBadge, memberDeleteSummary, memberOriginLabel, memberOriginTone } from "./MembersPage.js";

describe("MembersPage helpers", () => {
  it("labels detected and ChillClaw-managed members distinctly", () => {
    expect(memberOriginLabel({ source: "slackclaw", hasManagedMetadata: true })).toBe("Managed by ChillClaw");
    expect(memberOriginTone({ source: "slackclaw", hasManagedMetadata: true })).toBe("success");
    expect(memberOriginLabel({ source: "detected", hasManagedMetadata: false })).toBe("Detected from OpenClaw");
    expect(memberOriginTone({ source: "detected", hasManagedMetadata: false })).toBe("warning");
  });

  it("explains when removal can keep workspace history", () => {
    expect(
      memberDeleteSummary({
        name: "Alex Morgan",
        workspaceDir: "/Users/home/Library/Application Support/OpenClaw/agents/alex/workspace"
      })
    ).toContain("/Users/home/Library/Application Support/OpenClaw/agents/alex/workspace");
  });

  it("builds starter defaults from a daemon-owned member preset", () => {
    expect(
      buildMemberPresetDraft({
        id: "general-assistant",
        label: "General Assistant",
        description: "Everyday default preset",
        avatarPresetId: "operator",
        jobTitle: "General Assistant",
        personality: "Clear and dependable",
        soul: "Turn requests into useful next steps.",
        workStyles: ["Methodical", "Structured"],
        presetSkillIds: ["research-brief", "status-writer"],
        skillIds: ["research-brief", "status-writer"],
        knowledgePackIds: ["company-handbook"],
        defaultMemoryEnabled: true
      })
    ).toEqual({
      avatarPresetId: "operator",
      jobTitle: "General Assistant",
      personality: "Clear and dependable",
      soul: "Turn requests into useful next steps.",
      workStyles: ["Methodical", "Structured"],
      presetSkillIds: ["research-brief", "status-writer"],
      skillIds: ["research-brief", "status-writer"],
      knowledgePackIds: ["company-handbook"],
      memoryEnabled: true
    });
  });

  it("renders member operational state through StatusBadge semantics", () => {
    const html = renderToStaticMarkup(<MemberStatusBadge status="busy" />);

    expect(html).toContain("badge--status");
    expect(html).toContain("badge--info");
    expect(html).toContain("Busy");
  });
});
