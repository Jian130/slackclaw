import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import type { AIMemberRuntimeRequest } from "./adapter.js";
import { writeMemberWorkspaceFiles } from "./member-workspace.js";

const request: AIMemberRuntimeRequest = {
  memberId: "member-1",
  name: "Alex Morgan",
  jobTitle: "Research Lead",
  avatar: {
    presetId: "operator",
    accent: "var(--avatar-1)",
    emoji: "🦊",
    theme: "sunrise"
  },
  personality: "Analytical and calm",
  soul: "Turn ambiguity into clear next steps.",
  workStyles: ["Methodical", "Concise"],
  skillIds: ["research-brief", "status-writer"],
  selectedSkills: [
    {
      id: "research-brief",
      label: "Research Brief",
      description: "Create concise research summaries."
    },
    {
      id: "status-writer",
      label: "Status Writer",
      description: "Draft clear status updates."
    }
  ],
  capabilitySettings: {
    memoryEnabled: true,
    contextWindow: 128000
  },
  knowledgePacks: [
    {
      id: "company-handbook",
      label: "Company handbook",
      description: "Operating principles.",
      content: "# Company handbook"
    }
  ],
  brain: {
    entryId: "brain-1",
    label: "OpenAI GPT-5.4",
    providerId: "openai",
    modelKey: "openai/gpt-5.4"
  }
};

test("writeMemberWorkspaceFiles seeds a personalized multi-agent workspace", async () => {
  const workspaceDir = await mkdtemp(resolve(tmpdir(), "chillclaw-member-workspace-"));

  try {
    await writeMemberWorkspaceFiles(request, workspaceDir, {
      createBootstrap: true,
      now: new Date(2026, 2, 15, 14, 6, 5)
    });

    const agents = await readFile(resolve(workspaceDir, "AGENTS.md"), "utf8");
    const identity = await readFile(resolve(workspaceDir, "IDENTITY.md"), "utf8");
    const soul = await readFile(resolve(workspaceDir, "SOUL.md"), "utf8");
    const brain = await readFile(resolve(workspaceDir, "BRAIN.md"), "utf8");
    const user = await readFile(resolve(workspaceDir, "USER.md"), "utf8");
    const tools = await readFile(resolve(workspaceDir, "TOOLS.md"), "utf8");
    const memory = await readFile(resolve(workspaceDir, "MEMORY.md"), "utf8");
    const boot = await readFile(resolve(workspaceDir, "BOOT.md"), "utf8");
    const bootstrap = await readFile(resolve(workspaceDir, "BOOTSTRAP.md"), "utf8");
    const dailyMemory = await readFile(resolve(workspaceDir, "memory/2026-03-15.md"), "utf8");
    const skillsReadme = await readFile(resolve(workspaceDir, "skills/README.md"), "utf8");
    const skillProfile = await readFile(resolve(workspaceDir, "skills/research-brief.md"), "utf8");
    const knowledgeIndex = await readFile(resolve(workspaceDir, "knowledge/INDEX.md"), "utf8");
    const knowledgePack = await readFile(resolve(workspaceDir, "knowledge/company-handbook.md"), "utf8");
    const notesReadme = await readFile(resolve(workspaceDir, "notes/README.md"), "utf8");

    assert.match(agents, /Primary role: Research Lead/);
    assert.match(agents, /Brain: OpenAI GPT-5\.4 \(openai\/gpt-5\.4\)/);
    assert.match(agents, /Memory: enabled/);
    assert.match(agents, /Context window: 128000/);
    assert.match(identity, /Name: Alex Morgan/);
    assert.match(identity, /Avatar preset: operator/);
    assert.match(identity, /Brain model: openai\/gpt-5\.4/);
    assert.match(soul, /Analytical and calm/);
    assert.match(soul, /Turn ambiguity into clear next steps/);
    assert.match(soul, /Methodical/);
    assert.match(brain, /Primary AI model:/);
    assert.match(brain, /Research Brief \(research-brief\): Create concise research summaries\./);
    assert.match(user, /ChillClaw users and operators/);
    assert.match(user, /Keep my delivery aligned with these work styles/);
    assert.match(tools, /Research Brief \(research-brief\): Create concise research summaries\./);
    assert.match(tools, /Company handbook \(company-handbook\): Operating principles\./);
    assert.match(memory, /Selected knowledge packs:/);
    assert.match(memory, /Preferred work styles:/);
    assert.match(memory, /Active brain: OpenAI GPT-5\.4 \(openai\/gpt-5\.4\)/);
    assert.match(memory, /Research Brief \(research-brief\): Create concise research summaries\./);
    assert.match(boot, /memory\/2026-03-15\.md/);
    assert.match(bootstrap, /You are Alex Morgan/);
    assert.match(dailyMemory, /Workspace initialized for Alex Morgan/);
    assert.match(dailyMemory, /Personality: Analytical and calm/);
    assert.match(dailyMemory, /Operating soul: Turn ambiguity into clear next steps\./);
    assert.match(skillsReadme, /Research Brief \(research-brief\): Create concise research summaries\./);
    assert.match(skillProfile, /Skill id: research-brief/);
    assert.match(knowledgeIndex, /Company handbook \(company-handbook\): Operating principles\./);
    assert.equal(knowledgePack, "# Company handbook");
    assert.match(notesReadme, /Capture lightweight facts/);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("writeMemberWorkspaceFiles skips BOOTSTRAP when not creating a fresh workspace", async () => {
  const workspaceDir = await mkdtemp(resolve(tmpdir(), "chillclaw-member-workspace-"));

  try {
    await writeMemberWorkspaceFiles(request, workspaceDir, {
      createBootstrap: false,
      now: new Date(2026, 2, 15, 14, 6, 5)
    });

    await assert.rejects(readFile(resolve(workspaceDir, "BOOTSTRAP.md"), "utf8"));
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
