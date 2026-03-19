import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultProductOverview,
  type DeploymentTargetsResponse,
  type AITeamOverview,
  type ChatActionResponse,
  type ChatOverview,
  type ChannelConfigOverview,
  type ModelConfigOverview,
  type SkillCatalogOverview,
  type SkillMarketplaceDetail
} from "./index.js";

test("default product overview starts with OpenClaw not installed", () => {
  const overview = createDefaultProductOverview();

  assert.equal(overview.engine.engine, "openclaw");
  assert.equal(overview.engine.installed, false);
  assert.equal(overview.installSpec.desiredVersion, "latest");
  assert.equal(overview.templates.length > 4, true);
  assert.equal(overview.recoveryActions.some((action) => action.id === "reinstall-engine"), true);
});

test("deployment target shapes serialize installed and available claw runtime targets", () => {
  const payload: DeploymentTargetsResponse = {
    checkedAt: new Date().toISOString(),
    targets: [
      {
        id: "standard",
        title: "OpenClaw Standard",
        description: "Reuse an existing compatible install.",
        installMode: "system",
        installed: true,
        installable: true,
        planned: false,
        recommended: true,
        active: true,
        version: "2026.3.7",
        latestVersion: "2026.3.11",
        updateAvailable: true,
        summary: "Installed on this Mac.",
        requirements: ["macOS", "Node.js 22 or newer"],
        requirementsSourceUrl: "https://docs.openclaw.ai/install"
      },
      {
        id: "managed-local",
        title: "OpenClaw Managed Local",
        description: "SlackClaw-managed local runtime.",
        installMode: "managed-local",
        installed: false,
        installable: true,
        planned: false,
        recommended: false,
        active: false,
        latestVersion: "2026.3.11",
        updateAvailable: false,
        summary: "Available to install.",
        requirements: ["macOS", "Node.js 22 or newer"]
      }
    ]
  };

    const parsed = JSON.parse(JSON.stringify(payload)) as DeploymentTargetsResponse;
    assert.equal(parsed.targets[0]?.id, "standard");
    assert.equal(parsed.targets[0]?.installed, true);
    assert.equal(parsed.targets[0]?.requirements?.includes("Node.js 22 or newer"), true);
    assert.equal(parsed.targets[1]?.installMode, "managed-local");
  });

test("model config overview serializes providers, runtime models, and saved entries", () => {
  const payload: ModelConfigOverview = {
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        description: "OpenAI models.",
        docsUrl: "https://docs.openclaw.ai/providers/docs/openai",
        providerRefs: ["openai/"],
        authMethods: [
          {
            id: "api-key",
            label: "API key",
            kind: "api-key",
            description: "Paste an API key.",
            interactive: false,
            fields: [{ id: "apiKey", label: "API key", required: true, secret: true }]
          }
        ],
        configured: true,
        modelCount: 2,
        sampleModels: ["openai/gpt-5"]
      }
    ],
    models: [
      {
        key: "openai/gpt-5",
        name: "GPT-5",
        input: "text",
        contextWindow: 400000,
        local: false,
        available: true,
        tags: ["default", "configured"],
        missing: false
      }
    ],
    defaultModel: "openai/gpt-5",
    configuredModelKeys: ["openai/gpt-5"],
    savedEntries: [
      {
        id: "entry-1",
        label: "OpenAI GPT-5",
        providerId: "openai",
        modelKey: "openai/gpt-5",
        agentId: "main",
        authMethodId: "api-key",
        authModeLabel: "API key",
        profileLabel: "default",
        isDefault: true,
        isFallback: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    defaultEntryId: "entry-1",
    fallbackEntryIds: []
  };

  const parsed = JSON.parse(JSON.stringify(payload)) as ModelConfigOverview;
  assert.equal(parsed.providers[0]?.id, "openai");
  assert.equal(parsed.defaultModel, "openai/gpt-5");
  assert.equal(parsed.savedEntries[0]?.isDefault, true);
});

test("generic channel config shapes serialize with masked summaries and capabilities", () => {
  const overview: ChannelConfigOverview = {
    baseOnboardingCompleted: true,
    capabilities: [
      {
        id: "telegram",
        label: "Telegram",
        description: "Configure a Telegram bot.",
        officialSupport: true,
        iconKey: "TG",
        fieldDefs: [{ id: "token", label: "Bot token", required: true, secret: true }],
        supportsEdit: true,
        supportsRemove: true,
        supportsPairing: true,
        supportsLogin: false
      }
    ],
    entries: [
      {
        id: "telegram:default",
        channelId: "telegram",
        label: "Telegram",
        status: "awaiting-pairing",
        summary: "Telegram token saved.",
        detail: "Approve pairing next.",
        maskedConfigSummary: [{ label: "Bot token", value: "te...en" }],
        editableValues: { accountName: "Support Bot" },
        pairingRequired: true,
        lastUpdatedAt: new Date().toISOString()
      }
    ],
    gatewaySummary: "Gateway restarted after channel setup."
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as ChannelConfigOverview;

  assert.equal(parsed.capabilities[0].id, "telegram");
  assert.equal(parsed.entries[0].maskedConfigSummary[0].value, "te...en");
  assert.equal(parsed.entries[0].pairingRequired, true);
});

test("AI team overview serializes brain assignments and team membership", () => {
  const overview: AITeamOverview = {
    teamVision: "AI members help the team move routine work forward.",
    members: [
      {
        id: "member-1",
        agentId: "slackclaw-member-member-1",
        source: "slackclaw",
        hasManagedMetadata: true,
        name: "Alex Morgan",
        jobTitle: "Research Lead",
        status: "ready",
        currentStatus: "Ready for new assignments.",
        activeTaskCount: 0,
        avatar: {
          presetId: "operator",
          accent: "var(--avatar-1)",
          emoji: "🦊",
          theme: "sunrise"
        },
        brain: {
          entryId: "brain-1",
          label: "OpenAI GPT-5",
          providerId: "openai",
          modelKey: "openai/gpt-5"
        },
        teamIds: ["team-1"],
        bindingCount: 1,
        bindings: [{ id: "telegram", target: "telegram:support" }],
        lastUpdatedAt: new Date().toISOString(),
        personality: "Analytical and calm",
        soul: "Turn scattered requests into crisp next steps.",
        workStyles: ["Methodical"],
        skillIds: ["research-brief"],
        knowledgePackIds: ["company-handbook"],
        capabilitySettings: {
          memoryEnabled: true,
          contextWindow: 128000
        }
      }
    ],
    teams: [
      {
        id: "team-1",
        name: "Customer Ops",
        purpose: "Handle inbound operational requests.",
        memberIds: ["member-1"],
        memberCount: 1,
        updatedAt: new Date().toISOString()
      }
    ],
    activity: [],
    availableBrains: [],
    knowledgePacks: [
      {
        id: "company-handbook",
        label: "Company handbook",
        description: "Core company rules and expectations.",
        content: "# Company handbook"
      }
    ],
    skillOptions: [
      {
        id: "research-brief",
        label: "Research brief",
        description: "Turn notes into a structured brief."
      }
    ]
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as AITeamOverview;

  assert.equal(parsed.members[0].brain?.entryId, "brain-1");
  assert.equal(parsed.members[0].source, "slackclaw");
  assert.equal(parsed.members[0].hasManagedMetadata, true);
  assert.equal(parsed.members[0].bindingCount, 1);
  assert.equal(parsed.members[0].bindings[0]?.target, "telegram:support");
  assert.equal(parsed.teams[0].memberCount, 1);
});

test("AI member delete request serializes retention mode", () => {
  const payload = JSON.parse(JSON.stringify({ deleteMode: "keep-workspace" })) as { deleteMode: string };
  assert.equal(payload.deleteMode, "keep-workspace");
});

test("chat overview and action responses serialize thread state and messages", () => {
  const overview: ChatOverview = {
    threads: [
      {
        id: "thread-1",
        memberId: "member-1",
        agentId: "agent-1",
        sessionKey: "agent:agent-1:slackclaw-chat:thread-1",
        title: "Alex Morgan · Mar 14, 9:30 AM",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPreview: "Draft the weekly update.",
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        historyStatus: "ready",
        composerState: {
          status: "idle",
          canSend: true,
          canAbort: false
        }
      }
    ]
  };

  const response: ChatActionResponse = {
    status: "completed",
    message: "Started a new chat.",
    overview,
    thread: {
      ...overview.threads[0],
      messages: [
        {
          id: "message-1",
          role: "user",
          text: "Draft the weekly update.",
          clientMessageId: "client-1",
          status: "sent"
        },
        {
          id: "message-2",
          role: "assistant",
          text: "Here is a first draft.",
          status: "sent"
        }
      ]
    }
  };

  const parsed = JSON.parse(JSON.stringify(response)) as ChatActionResponse;
  assert.equal(parsed.overview.threads[0]?.sessionKey, "agent:agent-1:slackclaw-chat:thread-1");
  assert.equal(parsed.overview.threads[0]?.unreadCount, 0);
  assert.equal(parsed.thread?.messages[1]?.role, "assistant");
  assert.equal(parsed.thread?.messages[0]?.clientMessageId, "client-1");
  assert.equal(parsed.thread?.composerState.canSend, true);
});

test("skill catalog overview serializes installed entries and readiness", () => {
  const overview: SkillCatalogOverview = {
    managedSkillsDir: "/Users/home/.openclaw/workspace/skills",
    workspaceDir: "/Users/home/.openclaw/workspace",
    marketplaceAvailable: true,
    marketplaceSummary: "ClawHub is available.",
    installedSkills: [
      {
        id: "weather",
        slug: "weather",
        name: "weather",
        description: "Weather skill.",
        source: "bundled",
        bundled: true,
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
        homepage: "https://wttr.in/:help",
        version: "1.0.0",
        managedBy: "openclaw",
        editable: false,
        removable: false,
        updatable: false
      }
    ],
    readiness: {
      total: 1,
      eligible: 1,
      disabled: 0,
      blocked: 0,
      missing: 0,
      warnings: [],
      summary: "1 ready"
    },
    marketplacePreview: []
  };

  const parsed = JSON.parse(JSON.stringify(overview)) as SkillCatalogOverview;
  assert.equal(parsed.installedSkills[0]?.managedBy, "openclaw");
  assert.equal(parsed.readiness.total, 1);
});

test("skill marketplace detail serializes install metadata", () => {
  const detail: SkillMarketplaceDetail = {
    slug: "skill-finder",
    name: "Skill Finder",
    summary: "Find skills.",
    latestVersion: "1.1.5",
    updatedLabel: "just now",
    ownerHandle: "ivangdavila",
    downloads: 4015,
    stars: 7,
    installed: true,
    curated: true,
    changelog: "Broader discovery guidance.",
    license: "MIT-0",
    installsCurrent: 29,
    installsAllTime: 32,
    versions: 11,
    filePreview: "# Skill Finder",
    homepage: "https://clawic.com/skills/skill-finder"
  };

  const parsed = JSON.parse(JSON.stringify(detail)) as SkillMarketplaceDetail;
  assert.equal(parsed.slug, "skill-finder");
  assert.equal(parsed.installed, true);
  assert.equal(parsed.filePreview, "# Skill Finder");
});
