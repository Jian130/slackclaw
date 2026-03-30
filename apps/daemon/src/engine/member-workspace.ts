import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { KnowledgePack } from "@slackclaw/contracts";

import type { AIMemberRuntimeRequest } from "./adapter.js";

function memberToneList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- Clear and supportive";
}

function fileExists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(() => true).catch(() => false);
}

async function writeFileIfMissing(path: string, content: string) {
  if (await fileExists(path)) {
    return;
  }

  await writeFile(path, content);
}

function todayStamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectedSkillCatalog(
  request: AIMemberRuntimeRequest
): string {
  if (request.selectedSkills.length === 0) {
    return "- No explicit skills selected yet.";
  }

  return request.selectedSkills
    .map((skill) => `- ${skill.label} (${skill.id})${skill.description ? `: ${skill.description}` : ""}`)
    .join("\n");
}

function knowledgePackCatalog(knowledgePacks: KnowledgePack[]): string {
  if (knowledgePacks.length === 0) {
    return "- No preset knowledge packs selected yet.";
  }

  return knowledgePacks
    .map((pack) => `- ${pack.label} (${pack.id}): ${pack.description}`)
    .join("\n");
}

function buildIdentityMarkdown(request: AIMemberRuntimeRequest): string {
  return `# Identity

Name: ${request.name}
Job title: ${request.jobTitle}
Avatar preset: ${request.avatar.presetId}
Emoji: ${request.avatar.emoji}
Theme: ${request.avatar.theme ?? "default"}
Brain label: ${request.brain.label}
Brain model: ${request.brain.modelKey}

Public introduction:
- I am ${request.name}, working as ${request.jobTitle}.
- I should sound like a distinct teammate, not a generic assistant.
- My first impression should reflect this personality: ${request.personality || "Reliable and collaborative"}.
`;
}

function buildSoulMarkdown(request: AIMemberRuntimeRequest): string {
  return `# Soul

Personality:
${request.personality || "Reliable and collaborative"}

Operating soul:
${request.soul || "Turn unclear requests into useful next steps."}

Work styles:
${memberToneList(request.workStyles)}
`;
}

function buildUserMarkdown(request: AIMemberRuntimeRequest): string {
  return `# User

Primary people I help:
- SlackClaw users and operators who want plain-language help.
- Teammates who need clear updates, concrete next steps, and useful execution.

How to work with them:
- Ask for missing context only when it materially blocks progress.
- Default to the clearest useful next action.
- Match the user's language and keep jargon to a minimum.
- Keep my delivery aligned with these work styles:
${memberToneList(request.workStyles)}

Current role I am playing:
- ${request.jobTitle}
`;
}

function buildBrainMarkdown(request: AIMemberRuntimeRequest): string {
  return `# BRAIN

Primary AI model:
- ${request.brain.label}
- ${request.brain.modelKey}

Core capabilities:
- Memory: ${request.capabilitySettings.memoryEnabled ? "enabled" : "disabled"}
- Context window: ${request.capabilitySettings.contextWindow}

Equipped skills:
${selectedSkillCatalog(request)}

Connected knowledge packs:
${knowledgePackCatalog(request.knowledgePacks)}
`;
}

function buildAgentsMarkdown(request: AIMemberRuntimeRequest): string {
  return `# AGENTS

Primary role: ${request.jobTitle}
Brain: ${request.brain.label} (${request.brain.modelKey})
Memory: ${request.capabilitySettings.memoryEnabled ? "enabled" : "disabled"}
Context window: ${request.capabilitySettings.contextWindow}
Selected knowledge packs:
${knowledgePackCatalog(request.knowledgePacks)}
Selected shared skills:
${selectedSkillCatalog(request)}

Session startup:
1. Read SOUL.md.
2. Read USER.md.
3. Read BRAIN.md.
4. Read MEMORY.md and today's memory log.
5. Check TOOLS.md and the workspace skills/ folder before using tools.

Priorities:
- Work in plain language for non-technical users.
- Explain blockers with the clearest recovery action.
- Keep answers concise and decision-oriented.
- Write durable preferences and recurring facts into memory instead of relying on chat history.
`;
}

function buildToolsMarkdown(request: AIMemberRuntimeRequest): string {
  return `# TOOLS

Equipped shared skills:
${selectedSkillCatalog(request)}

Knowledge packs available in knowledge/:
${knowledgePackCatalog(request.knowledgePacks)}

Tooling rules:
- Prefer the safest existing skill or documented workflow before improvising.
- Use the local workspace folders to keep notes, briefs, and deliverables organized.
- If a recurring preference or operating rule emerges, write it down in MEMORY.md or the daily memory log.
`;
}

function buildMemoryMarkdown(request: AIMemberRuntimeRequest): string {
  return `# MEMORY

Stable identity:
- Name: ${request.name}
- Role: ${request.jobTitle}
- Preferred tone: ${request.personality || "Reliable and collaborative"}
- Preferred work styles:
${memberToneList(request.workStyles)}
- Active brain: ${request.brain.label} (${request.brain.modelKey})
- Context window: ${request.capabilitySettings.contextWindow}
- Equipped skills:
${selectedSkillCatalog(request)}

Long-term operating notes:
- ${request.soul || "Turn unclear requests into useful next steps."}
- Memory is ${request.capabilitySettings.memoryEnabled ? "enabled" : "disabled"} for this agent.
- Selected knowledge packs:
${knowledgePackCatalog(request.knowledgePacks)}
`;
}

function buildHeartbeatMarkdown(request: AIMemberRuntimeRequest): string {
  return `# HEARTBEAT

- Check whether any active user requests or follow-ups are blocked.
- Refresh today's memory log if a new durable fact or preference appeared.
- Keep updates short, concrete, and aligned with my role as ${request.jobTitle}.
- Use the equipped skills and knowledge packs listed in BRAIN.md before reinventing a workflow.
`;
}

function buildBootMarkdown(request: AIMemberRuntimeRequest, now: Date): string {
  return `# BOOT

- Confirm my identity from IDENTITY.md.
- Re-read SOUL.md, USER.md, BRAIN.md, and MEMORY.md before acting.
- Review today's memory log in memory/${todayStamp(now)}.md if it exists.
- Resume work as ${request.name}, not as a generic assistant.
`;
}

function buildBootstrapMarkdown(request: AIMemberRuntimeRequest): string {
  return `# BOOTSTRAP

You are ${request.name}, a newly created OpenClaw agent working as ${request.jobTitle}.

First-run ritual:
1. Read IDENTITY.md, SOUL.md, USER.md, BRAIN.md, AGENTS.md, TOOLS.md, and MEMORY.md.
2. Review the knowledge/ folder, knowledge/INDEX.md, and selected skills in skills/README.md.
3. Confirm how you should introduce yourself in the first user-facing reply.
4. After the workspace feels grounded, delete BOOTSTRAP.md so this ritual only happens once.
`;
}

function buildDailyMemoryMarkdown(request: AIMemberRuntimeRequest, now: Date): string {
  return `# ${todayStamp(now)}

Setup notes:
- Workspace initialized for ${request.name}.
- Role: ${request.jobTitle}
- Brain: ${request.brain.label} (${request.brain.modelKey})
- Personality: ${request.personality || "Reliable and collaborative"}
- Operating soul: ${request.soul || "Turn unclear requests into useful next steps."}
- Selected skills:
${selectedSkillCatalog(request)}
- Selected knowledge packs:
${knowledgePackCatalog(request.knowledgePacks)}

Add durable facts, preferences, and follow-ups below as they appear.
`;
}

function buildSkillsReadme(request: AIMemberRuntimeRequest): string {
  return `# Workspace Skills

This folder is reserved for workspace-local skills and wrappers.

Selected shared skills:
${selectedSkillCatalog(request)}

Use this folder when the agent needs a local skill that should live only inside this workspace instead of the shared OpenClaw skills library.
`;
}

function buildSkillProfileMarkdown(request: AIMemberRuntimeRequest, skillId: string): string {
  const selectedSkill = request.selectedSkills.find((skill) => skill.id === skillId);

  return `# ${selectedSkill?.label ?? skillId}

Skill id: ${skillId}
${selectedSkill?.description ? `Description: ${selectedSkill.description}\n` : ""}How this agent should use it:
- Reach for this skill when it fits the member's role as ${request.jobTitle}.
- Prefer this skill over ad hoc work when it directly matches the request.
- Record durable patterns learned from this skill into MEMORY.md or the daily memory log.
`;
}

function buildFolderReadme(title: string, description: string): string {
  return `# ${title}

${description}
`;
}

export async function writeMemberWorkspaceFiles(
  request: AIMemberRuntimeRequest,
  workspaceDir: string,
  options?: { createBootstrap?: boolean; now?: Date }
): Promise<void> {
  const now = options?.now ?? new Date();
  const knowledgeDir = resolve(workspaceDir, "knowledge");
  const memoryDir = resolve(workspaceDir, "memory");
  const skillsDir = resolve(workspaceDir, "skills");
  const notesDir = resolve(workspaceDir, "notes");
  const briefsDir = resolve(workspaceDir, "briefs");
  const deliverablesDir = resolve(workspaceDir, "deliverables");
  const scratchDir = resolve(workspaceDir, "scratch");

  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(knowledgeDir, { recursive: true }),
    mkdir(memoryDir, { recursive: true }),
    mkdir(skillsDir, { recursive: true }),
    mkdir(notesDir, { recursive: true }),
    mkdir(briefsDir, { recursive: true }),
    mkdir(deliverablesDir, { recursive: true }),
    mkdir(scratchDir, { recursive: true })
  ]);

  await writeFile(resolve(workspaceDir, "IDENTITY.md"), buildIdentityMarkdown(request));
  await writeFile(resolve(workspaceDir, "SOUL.md"), buildSoulMarkdown(request));
  await writeFile(resolve(workspaceDir, "USER.md"), buildUserMarkdown(request));
  await writeFile(resolve(workspaceDir, "BRAIN.md"), buildBrainMarkdown(request));
  await writeFile(resolve(workspaceDir, "AGENTS.md"), buildAgentsMarkdown(request));
  await writeFile(resolve(workspaceDir, "TOOLS.md"), buildToolsMarkdown(request));
  await writeFile(resolve(workspaceDir, "MEMORY.md"), buildMemoryMarkdown(request));
  await writeFile(resolve(workspaceDir, "HEARTBEAT.md"), buildHeartbeatMarkdown(request));
  await writeFile(resolve(workspaceDir, "BOOT.md"), buildBootMarkdown(request, now));
  await writeFile(resolve(skillsDir, "README.md"), buildSkillsReadme(request));

  await writeFileIfMissing(resolve(memoryDir, `${todayStamp(now)}.md`), buildDailyMemoryMarkdown(request, now));
  await writeFileIfMissing(resolve(notesDir, "README.md"), buildFolderReadme("Notes", "Capture lightweight facts, meeting notes, and user-specific context here."));
  await writeFileIfMissing(resolve(briefsDir, "README.md"), buildFolderReadme("Briefs", "Store reusable briefs, plans, and request summaries here."));
  await writeFileIfMissing(
    resolve(deliverablesDir, "README.md"),
    buildFolderReadme("Deliverables", "Put polished outputs, final drafts, and handoff-ready work here.")
  );
  await writeFileIfMissing(resolve(scratchDir, "README.md"), buildFolderReadme("Scratch", "Use this folder for temporary working files and disposable experiments."));
  await writeFileIfMissing(
    resolve(knowledgeDir, "README.md"),
    buildFolderReadme("Knowledge", "SlackClaw copies selected preset knowledge packs into this folder for this agent.")
  );
  await writeFile(resolve(knowledgeDir, "INDEX.md"), `# Knowledge Index

${knowledgePackCatalog(request.knowledgePacks)}
`);

  if (options?.createBootstrap) {
    await writeFileIfMissing(resolve(workspaceDir, "BOOTSTRAP.md"), buildBootstrapMarkdown(request));
  }

  for (const skill of request.selectedSkills) {
    const skillId = skill.id;
    await writeFile(resolve(skillsDir, `${skillId}.md`), buildSkillProfileMarkdown(request, skillId));
  }

  for (const pack of request.knowledgePacks) {
    await writeFile(resolve(knowledgeDir, `${pack.id}.md`), pack.content);
  }
}
