import {
  ArrowRight,
  Box,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  Edit2,
  Lightbulb,
  Link2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Workflow,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AIMemberDetail, AIMemberPreset, DeleteAIMemberRequest, MemberBindingSummary, SaveAIMemberRequest } from "@slackclaw/contracts";
import { useNavigate } from "react-router-dom";

import { useAITeam } from "../../app/providers/AITeamProvider.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { fetchAIMemberBindings } from "../../shared/api/client.js";
import { memberAvatarPresets } from "../../shared/avatar-presets.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/Card.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { FieldLabel, Input, Select, Textarea } from "../../shared/ui/Field.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { LoadingPanel } from "../../shared/ui/LoadingPanel.js";
import { MemberAvatar, memberInitials } from "../../shared/ui/MemberAvatar.js";
import { WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";

const workStyleOptions = ["Methodical", "Fast-paced", "Data-driven", "Adaptive", "Warm", "Structured"];
const quickActionTemplates = [
  {
    id: "research",
    label: "Research a topic",
    icon: Search,
    buildPrompt: (member: AIMemberDetail) =>
      `Research the latest developments in this topic and give me a concise executive summary in ${member.workStyles[0] ?? "a clear"} style.`
  },
  {
    id: "summarize",
    label: "Summarize a document",
    icon: BookOpen,
    buildPrompt: (member: AIMemberDetail) =>
      `Summarize this document into the key decisions, risks, and next steps. Keep the output useful for a ${member.jobTitle.toLowerCase()}.`
  },
  {
    id: "draft",
    label: "Draft a report",
    icon: ClipboardList,
    buildPrompt: (member: AIMemberDetail) =>
      `Draft a polished report with findings, recommendations, and a short action plan. Use ${member.personality || "a confident"} tone.`
  },
  {
    id: "insights",
    label: "Extract insights",
    icon: Lightbulb,
    buildPrompt: () => "Review the information I provide and extract the most important insights, open questions, and practical follow-ups."
  }
] as const;

export function memberOriginTone(member: Pick<AIMemberDetail, "source" | "hasManagedMetadata">): "success" | "warning" {
  return member.source === "slackclaw" && member.hasManagedMetadata ? "success" : "warning";
}

export function memberOriginLabel(member: Pick<AIMemberDetail, "source" | "hasManagedMetadata">): string {
  if (member.source === "slackclaw" && member.hasManagedMetadata) {
    return "Managed by ChillClaw";
  }

  return "Detected from OpenClaw";
}

export function memberDeleteSummary(member: Pick<AIMemberDetail, "name" | "workspaceDir">): string {
  return member.workspaceDir
    ? `${member.name}'s OpenClaw agent will be removed. You can also keep the workspace and history at ${member.workspaceDir}.`
    : `${member.name}'s OpenClaw agent will be removed. You can also keep the workspace and history in place.`;
}

function extractTraitBadges(text: string): string[] {
  return text
    .split(/[,\n;|/]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.length <= 24) {
        return item;
      }

      return item
        .split(/\s+/)
        .slice(0, 3)
        .join(" ");
    })
    .slice(0, 2);
}

function memberStatusLabel(status: AIMemberDetail["status"]): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "busy":
      return "Busy";
    case "idle":
    default:
      return "Idle";
  }
}

function memberStatusTone(status: AIMemberDetail["status"]): "success" | "info" | "neutral" {
  switch (status) {
    case "ready":
      return "success";
    case "busy":
      return "info";
    case "idle":
    default:
      return "neutral";
  }
}

function memberTaskLabel(count: number): string {
  if (count <= 0) {
    return "No active tasks";
  }

  return `${count} active ${count === 1 ? "task" : "tasks"}`;
}

function memberGreeting(member: AIMemberDetail): string {
  const styleLabel = member.workStyles[0] ? `${member.workStyles[0].toLowerCase()} style` : "clear style";
  const personality = member.personality?.trim() || member.currentStatus?.trim();
  const summary = personality ? `${personality.replace(/\.+$/, "")}.` : "I'm ready to help with your next task.";

  return `Hey — I'm ${member.name}, your ${member.jobTitle}. ${summary} I can work with you in a ${styleLabel}.`;
}

function skillIconForLabel(label: string) {
  const value = label.toLowerCase();

  if (value.includes("research") || value.includes("search")) {
    return Search;
  }
  if (value.includes("email") || value.includes("mail")) {
    return Mail;
  }
  if (value.includes("knowledge") || value.includes("database")) {
    return Database;
  }
  if (value.includes("analysis") || value.includes("trend") || value.includes("insight")) {
    return TrendingUp;
  }
  if (value.includes("note") || value.includes("summary") || value.includes("report")) {
    return BookOpen;
  }
  if (value.includes("project") || value.includes("task")) {
    return ClipboardList;
  }

  return Zap;
}

type MemberPresetDraft = {
  avatarPresetId: string;
  jobTitle: string;
  personality: string;
  soul: string;
  workStyles: string[];
  skillIds: string[];
  knowledgePackIds: string[];
  memoryEnabled: boolean;
};

export function buildMemberPresetDraft(preset?: AIMemberPreset): MemberPresetDraft {
  return {
    avatarPresetId: preset?.avatarPresetId || memberAvatarPresets[0].id,
    jobTitle: preset?.jobTitle ?? "",
    personality: preset?.personality ?? "",
    soul: preset?.soul ?? "",
    workStyles: preset?.workStyles ?? [],
    skillIds: preset?.skillIds ?? [],
    knowledgePackIds: preset?.knowledgePackIds ?? [],
    memoryEnabled: preset?.defaultMemoryEnabled ?? true
  };
}

function MemberDialog(props: {
  open: boolean;
  member?: AIMemberDetail;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const copy = t(locale).members;
  const { overview, saveMember } = useAITeam();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [avatarPresetId, setAvatarPresetId] = useState(memberAvatarPresets[0].id);
  const [brainEntryId, setBrainEntryId] = useState("");
  const [personality, setPersonality] = useState("");
  const [soul, setSoul] = useState("");
  const [workStyles, setWorkStyles] = useState<string[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [knowledgePackIds, setKnowledgePackIds] = useState<string[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [contextWindow, setContextWindow] = useState("128000");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open) {
      return;
    }

    if (props.member) {
      const member = props.member;
      const preset = memberAvatarPresets.find((item) => item.id === member.avatar.presetId) ?? memberAvatarPresets[0];
      setSelectedPresetId("");
      setName(member.name);
      setJobTitle(member.jobTitle);
      setAvatarPresetId(preset.id);
      setBrainEntryId(member.brain?.entryId ?? overview?.availableBrains[0]?.id ?? "");
      setPersonality(member.personality);
      setSoul(member.soul);
      setWorkStyles(member.workStyles);
      setSkillIds(member.skillIds);
      setKnowledgePackIds(member.knowledgePackIds);
      setMemoryEnabled(member.capabilitySettings.memoryEnabled ?? true);
    } else {
      const preset = overview?.memberPresets[0];
      const presetDraft = buildMemberPresetDraft(preset);
      setSelectedPresetId(preset?.id ?? "");
      setName("");
      setJobTitle(presetDraft.jobTitle);
      setAvatarPresetId(presetDraft.avatarPresetId);
      setBrainEntryId(overview?.availableBrains[0]?.id ?? "");
      setPersonality(presetDraft.personality);
      setSoul(presetDraft.soul);
      setWorkStyles(presetDraft.workStyles);
      setSkillIds(presetDraft.skillIds);
      setKnowledgePackIds(presetDraft.knowledgePackIds);
      setMemoryEnabled(presetDraft.memoryEnabled);
    }
    setContextWindow(String(props.member?.capabilitySettings.contextWindow ?? 128000));
    setError(undefined);
  }, [overview?.availableBrains, overview?.memberPresets, props.member, props.open]);

  const avatar = memberAvatarPresets.find((item) => item.id === avatarPresetId) ?? memberAvatarPresets[0];
  const selectedPreset = overview?.memberPresets.find((preset) => preset.id === selectedPresetId);

  function toggle(list: string[], setter: (next: string[]) => void, value: string) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = overview?.memberPresets.find((item) => item.id === presetId);
    const presetDraft = buildMemberPresetDraft(preset);
    setAvatarPresetId(presetDraft.avatarPresetId);
    setJobTitle(presetDraft.jobTitle);
    setPersonality(presetDraft.personality);
    setSoul(presetDraft.soul);
    setWorkStyles(presetDraft.workStyles);
    setSkillIds(presetDraft.skillIds);
    setKnowledgePackIds(presetDraft.knowledgePackIds);
    setMemoryEnabled(presetDraft.memoryEnabled);
  }

  async function handleSave() {
    if (!brainEntryId) {
      setError("Choose a Brain before saving.");
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const request: SaveAIMemberRequest = {
        name,
        jobTitle,
        avatar: {
          presetId: avatar.id,
          accent: avatar.accent,
          emoji: avatar.emoji,
          theme: avatar.theme
        },
        brainEntryId,
        personality,
        soul,
        workStyles,
        skillIds,
        knowledgePackIds,
        capabilitySettings: {
          memoryEnabled,
          contextWindow: Number(contextWindow) || 128000
        }
      };

      await saveMember(props.member?.id, request);
      props.onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "ChillClaw could not save this AI member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.member ? "Edit AI Member" : "Add AI Member"}
      description="Define identity, Brain, work style, and knowledge for this OpenClaw-backed member."
      wide
    >
      <LoadingBlocker active={busy} label="Saving AI member" description="ChillClaw is creating the member and syncing the OpenClaw agent workspace.">
        <div className="panel-stack">
          {error ? <p className="card__description" style={{ color: "var(--danger)" }}>{error}</p> : null}
          {!props.member ? (
            <div className="field-grid">
              <div>
                <FieldLabel htmlFor="member-preset">{copy.memberPresetLabel ?? "Preset"}</FieldLabel>
                <Select id="member-preset" value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
                  {overview?.memberPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="members-detail-card" style={{ padding: "0.85rem 1rem" }}>
                <div className="members-detail-card__eyebrow">
                  <Box size={16} />
                  <span>{copy.memberPresetSummaryLabel ?? "Preset summary"}</span>
                </div>
                <strong>{selectedPreset?.label ?? copy.memberPresetCustomLabel ?? "Custom setup"}</strong>
                <p className="card__description">{selectedPreset?.description ?? copy.memberPresetSummaryBody ?? "Choose a preset to preload a useful starter setup."}</p>
              </div>
            </div>
          ) : null}
          <div className="field-grid">
            <div>
              <FieldLabel htmlFor="member-name">Name</FieldLabel>
              <Input id="member-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="member-title">Job Title</FieldLabel>
              <Input id="member-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
            </div>
          </div>
          <div className="field-grid">
            <div>
              <FieldLabel htmlFor="member-avatar">Avatar</FieldLabel>
              <Select id="member-avatar" value={avatarPresetId} onChange={(event) => setAvatarPresetId(event.target.value)}>
                {memberAvatarPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="member-brain">Brain</FieldLabel>
              <Select id="member-brain" value={brainEntryId} onChange={(event) => setBrainEntryId(event.target.value)}>
                {overview?.availableBrains.map((brain) => (
                  <option key={brain.id} value={brain.id}>
                    {brain.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="field-grid">
            <div>
              <FieldLabel htmlFor="member-personality">Personality</FieldLabel>
              <Textarea id="member-personality" rows={3} value={personality} onChange={(event) => setPersonality(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="member-soul">Soul</FieldLabel>
              <Textarea id="member-soul" rows={3} value={soul} onChange={(event) => setSoul(event.target.value)} />
            </div>
          </div>

          <div>
            <FieldLabel>Work Styles</FieldLabel>
            <div className="personality-grid">
              {workStyleOptions.map((item) => (
                <button
                  key={item}
                  className={`badge ${workStyles.includes(item) ? "badge--info" : "badge--neutral"}`}
                  onClick={() => toggle(workStyles, setWorkStyles, item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="field-grid">
            <div>
              <FieldLabel>Skills</FieldLabel>
              <div className="skill-chip-grid">
                {overview?.skillOptions.map((skill) => (
                  <button
                    key={skill.id}
                    className={`badge ${skillIds.includes(skill.id) ? "badge--success" : "badge--neutral"}`}
                    onClick={() => toggle(skillIds, setSkillIds, skill.id)}
                    type="button"
                  >
                    {skill.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Knowledge Packs</FieldLabel>
              <div className="skill-chip-grid">
                {overview?.knowledgePacks.map((pack) => (
                  <button
                    key={pack.id}
                    className={`badge ${knowledgePackIds.includes(pack.id) ? "badge--success" : "badge--neutral"}`}
                    onClick={() => toggle(knowledgePackIds, setKnowledgePackIds, pack.id)}
                    type="button"
                  >
                    {pack.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field-grid">
            <div>
              <FieldLabel htmlFor="member-context">Context Window</FieldLabel>
              <Input id="member-context" value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="member-memory">Memory</FieldLabel>
              <Select id="member-memory" value={memoryEnabled ? "enabled" : "disabled"} onChange={(event) => setMemoryEnabled(event.target.value === "enabled")}>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          </div>

          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={props.onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} loading={busy}>
              {busy ? "Saving..." : "Save AI Member"}
            </Button>
          </div>
        </div>
      </LoadingBlocker>
    </Dialog>
  );
}

function RemoveMemberDialog(props: {
  open: boolean;
  member?: AIMemberDetail;
  onClose: () => void;
  onConfirm: (request: DeleteAIMemberRequest) => Promise<void>;
}) {
  const [busyMode, setBusyMode] = useState<DeleteAIMemberRequest["deleteMode"]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open) {
      setBusyMode(undefined);
      setError(undefined);
    }
  }, [props.open]);

  if (!props.member) {
    return null;
  }

  async function handleConfirm(deleteMode: DeleteAIMemberRequest["deleteMode"]) {
    setBusyMode(deleteMode);
    setError(undefined);

    try {
      await props.onConfirm({ deleteMode });
      props.onClose();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "ChillClaw could not remove this AI member.");
      setBusyMode(undefined);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!busyMode) {
          props.onClose();
        }
      }}
      title={`Remove ${props.member.name}?`}
      description="Choose whether to fully delete the member or keep the workspace and history in place."
    >
      <LoadingBlocker active={Boolean(busyMode)} label="Removing AI member" description="ChillClaw is updating OpenClaw and the team roster.">
        <div className="panel-stack">
          {error ? <p className="card__description" style={{ color: "var(--danger)" }}>{error}</p> : null}
          <p className="card__description">{memberDeleteSummary(props.member)}</p>
          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={props.onClose} disabled={Boolean(busyMode)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleConfirm("keep-workspace")}
              loading={busyMode === "keep-workspace"}
              disabled={Boolean(busyMode) && busyMode !== "keep-workspace"}
            >
              {busyMode === "keep-workspace" ? "Removing..." : "Delete Agent, Keep Workspace"}
            </Button>
            <Button
              onClick={() => void handleConfirm("full")}
              loading={busyMode === "full"}
              disabled={Boolean(busyMode) && busyMode !== "full"}
            >
              {busyMode === "full" ? "Removing..." : "Delete Agent and Workspace"}
            </Button>
          </div>
        </div>
      </LoadingBlocker>
    </Dialog>
  );
}

export default function MembersPage() {
  const { locale } = useLocale();
  const copy = t(locale).members;
  const common = t(locale).common;
  const { overview, loading, error, removeMember } = useAITeam();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AIMemberDetail["status"]>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string>();
  const [panelTab, setPanelTab] = useState<"chat" | "tasks">("chat");
  const [launchDraft, setLaunchDraft] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<AIMemberDetail>();
  const [removingMember, setRemovingMember] = useState<AIMemberDetail>();
  const [selectedBindings, setSelectedBindings] = useState<MemberBindingSummary[]>();
  const [bindingsLoading, setBindingsLoading] = useState(false);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return overview?.members.filter((member) => {
      const matchesQuery =
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.jobTitle.toLowerCase().includes(query) ||
        member.skillIds.some((skillId) => {
          const skillLabel = overview.skillOptions.find((skill) => skill.id === skillId)?.label ?? skillId;
          return skillLabel.toLowerCase().includes(query);
        });
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;
      return matchesQuery && matchesStatus;
    }) ?? [];
  }, [overview, searchQuery, statusFilter]);

  const selectedMember = useMemo(
    () => overview?.members.find((member) => member.id === selectedMemberId),
    [overview?.members, selectedMemberId]
  );

  useEffect(() => {
    if (!selectedMember?.id) {
      setSelectedBindings(undefined);
      setBindingsLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedBindings(undefined);
    setBindingsLoading(true);

    void fetchAIMemberBindings(selectedMember.id, { fresh: true })
      .then((response) => {
        if (!cancelled) {
          setSelectedBindings(response.bindings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedBindings(selectedMember.bindings);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBindingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMember?.id]);

  useEffect(() => {
    if (!selectedMember) {
      return;
    }

    setPanelTab("chat");
    setLaunchDraft("");
  }, [selectedMember?.id]);

  const memberBindings = selectedBindings ?? selectedMember?.bindings ?? [];

  const memberCounts = useMemo(
    () => ({
      total: overview?.members.length ?? 0,
      ready: overview?.members.filter((member) => member.status === "ready").length ?? 0,
      busy: overview?.members.filter((member) => member.status === "busy").length ?? 0
    }),
    [overview?.members]
  );

  async function handleDelete(member: AIMemberDetail, request: DeleteAIMemberRequest) {
    await removeMember(member.id, request);
    setSelectedMemberId((current) => (current === member.id ? undefined : current));
  }

  function openChat(mode: "new" | "reuse-recent" = "reuse-recent") {
    if (!selectedMember) {
      return;
    }

    navigate(`/chat?memberId=${encodeURIComponent(selectedMember.id)}&mode=${mode}`);
  }

  function handleSelectQuickAction(prompt: string) {
    setPanelTab("chat");
    setLaunchDraft(prompt);
  }

  if (loading && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <LoadingPanel title="Loading AI members" description="ChillClaw is reading the live OpenClaw agent roster and member metadata." />
      </WorkspaceScaffold>
    );
  }

  if (error && !overview) {
    return (
      <EmptyState
        title="ChillClaw could not load AI members"
        description={error}
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  return (
    <WorkspaceScaffold
      className="members-studio"
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <div className="members-studio__brand">
          <strong>ChillClaw</strong>
          <span>Powered by OpenClaw</span>
        </div>
      }
    >

      <Card className="members-vision-card">
        <CardContent className="members-vision-card__content">
          <div className="members-vision-card__icon">
            <Sparkles size={20} />
          </div>
          <div className="members-vision-card__copy">
            <span className="members-vision-card__eyebrow">{copy.visionLabel}</span>
            <h2>{overview?.teamVision || copy.visionFallback}</h2>
            <p>{copy.visionBody}</p>
            <div className="actions-row">
              <Badge tone="info">{`${memberCounts.total} ${copy.employeeCountSuffix}`}</Badge>
              <Badge tone="success">{`${memberCounts.ready} ${copy.ready.toLowerCase()}`}</Badge>
              <Badge tone="neutral">{`${memberCounts.busy} ${copy.busy.toLowerCase()}`}</Badge>
            </div>
          </div>
          <div className="members-vision-card__actions">
            <Button variant="outline" onClick={() => navigate("/team")}>
              <Workflow size={14} />
              {copy.openTeam}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="members-action-bar">
        <div className="members-search-field">
          <Search size={18} />
          <Input
            aria-label={copy.searchPlaceholder}
            placeholder={copy.searchPlaceholder}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <Select
          aria-label={copy.filterStatus}
          className="members-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | AIMemberDetail["status"])}
        >
          <option value="all">{copy.allStatuses}</option>
          <option value="ready">{copy.ready}</option>
          <option value="busy">{copy.busy}</option>
          <option value="idle">{copy.idle}</option>
        </Select>
        <Button
          className="members-action-bar__primary"
          onClick={() => {
            setEditingMember(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus size={16} />
          {copy.createAnother}
        </Button>
      </section>

      {overview?.members.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyBody}
          actionLabel={copy.createAnother}
          onAction={() => setDialogOpen(true)}
        />
      ) : filteredMembers.length === 0 ? (
        <EmptyState
          title={copy.emptySearchTitle}
          description={copy.emptySearchBody}
          actionLabel={common.retry}
          onAction={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
        />
      ) : (
        <div className="members-card-grid">
          {filteredMembers.map((member) => {
            const personalityTags = extractTraitBadges(member.personality);
            const memberSkills = member.skillIds
              .map((skillId) => overview?.skillOptions.find((skill) => skill.id === skillId)?.label ?? skillId)
              .slice(0, 2);

            return (
              <article
                className={`member-spotlight-card${selectedMemberId === member.id ? " member-spotlight-card--active" : ""}`}
                key={member.id}
              >
                <div
                  className="member-spotlight-card__stage"
                  style={{ "--member-accent": member.avatar.accent } as CSSProperties}
                >
                  <div className="member-spotlight-card__badge-row">
                    <Badge tone={memberStatusTone(member.status)}>{memberStatusLabel(member.status)}</Badge>
                    {member.capabilitySettings.memoryEnabled ? <Badge tone="info">{copy.memoryEnabled}</Badge> : null}
                  </div>
                  <div className="member-spotlight-card__avatar-shell">
                    <MemberAvatar
                      avatar={member.avatar}
                      className="member-spotlight-card__avatar-emoji"
                      name={member.name}
                    />
                    <div className="member-spotlight-card__avatar-mark">{memberInitials(member.name)}</div>
                  </div>
                </div>

                <div className="member-spotlight-card__body">
                  <div className="member-spotlight-card__identity">
                    <h3>{member.name}</h3>
                    <p>{member.jobTitle}</p>
                  </div>

                  <div className="member-spotlight-card__task-pill">
                    <Clock3 size={16} />
                    <span>{memberTaskLabel(member.activeTaskCount)}</span>
                  </div>

                  <div className="member-spotlight-card__tag-groups">
                    <div className="member-spotlight-card__tag-row">
                      {personalityTags.length > 0 ? personalityTags.map((trait) => (
                        <Badge key={trait} tone="info">{trait}</Badge>
                      )) : <Badge tone="info">{memberStatusLabel(member.status)}</Badge>}
                    </div>
                    <div className="member-spotlight-card__tag-row">
                      {member.workStyles.slice(0, 2).map((style) => (
                        <Badge key={style} tone="neutral">{style}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="member-spotlight-card__brain">
                    <Brain size={16} />
                    <strong>{member.brain?.label ?? copy.brainFallback}</strong>
                  </div>

                  <div className="member-spotlight-card__skills">
                    {memberSkills.map((skill) => {
                      const Icon = skillIconForLabel(skill);
                      return (
                        <div className="member-spotlight-card__skill-chip" key={skill}>
                          <Icon size={14} />
                          <span>{skill}</span>
                        </div>
                      );
                    })}
                    {member.skillIds.length > 2 ? <Badge tone="neutral">{`+${member.skillIds.length - 2}`}</Badge> : null}
                  </div>

                  <div className="member-spotlight-card__footer">
                    <Badge tone={memberOriginTone(member)}>{memberOriginLabel(member)}</Badge>
                    <Badge tone="neutral">{`${member.bindingCount} ${member.bindingCount === 1 ? copy.bindingSingular : copy.bindingPlural}`}</Badge>
                  </div>

                  <Button
                    className="member-spotlight-card__cta"
                    fullWidth
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <MessageSquare size={16} />
                    {copy.chatManage}
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <MemberDialog open={dialogOpen} member={editingMember} onClose={() => setDialogOpen(false)} />
      <RemoveMemberDialog
        open={Boolean(removingMember)}
        member={removingMember}
        onClose={() => setRemovingMember(undefined)}
        onConfirm={async (request) => {
          if (!removingMember) {
            return;
          }

          await handleDelete(removingMember, request);
          setRemovingMember(undefined);
        }}
      />

      {selectedMember ? (
        <div className="members-panel-backdrop" role="presentation">
          <aside className="members-panel">
            <div
              className="members-panel__header"
              style={{ "--member-accent": selectedMember.avatar.accent } as CSSProperties}
            >
              <div className="members-panel__topbar">
                <div className="members-panel__identity">
                  <MemberAvatar
                    avatar={selectedMember.avatar}
                    className="members-panel__avatar"
                    name={selectedMember.name}
                  />
                  <div>
                    <h2>{selectedMember.name}</h2>
                    <p>{selectedMember.jobTitle}</p>
                    <div className="actions-row">
                      <Badge tone={memberStatusTone(selectedMember.status)}>{memberStatusLabel(selectedMember.status)}</Badge>
                      <Badge tone={memberOriginTone(selectedMember)}>{memberOriginLabel(selectedMember)}</Badge>
                      <Badge tone="neutral">{memberTaskLabel(selectedMember.activeTaskCount)}</Badge>
                    </div>
                  </div>
                </div>
                <button
                  className="members-panel__close"
                  onClick={() => setSelectedMemberId(undefined)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="members-panel__toolbar">
                <Button onClick={() => openChat("reuse-recent")}>
                  <MessageSquare size={14} />
                  {copy.startChat}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingMember(selectedMember);
                    setDialogOpen(true);
                  }}
                >
                  <Edit2 size={14} />
                  {copy.edit}
                </Button>
                <Button variant="outline" onClick={() => setRemovingMember(selectedMember)}>
                  <Trash2 size={14} />
                  {copy.remove}
                </Button>
              </div>

              <div className="members-panel__tabs">
                <button
                  className={`members-panel__tab${panelTab === "chat" ? " members-panel__tab--active" : ""}`}
                  onClick={() => setPanelTab("chat")}
                  type="button"
                >
                  <MessageSquare size={14} />
                  {copy.chatTab}
                </button>
                <button
                  className={`members-panel__tab${panelTab === "tasks" ? " members-panel__tab--active" : ""}`}
                  onClick={() => setPanelTab("tasks")}
                  type="button"
                >
                  <ClipboardList size={14} />
                  {copy.tasksTab}
                </button>
              </div>
            </div>

            <div className="members-panel__body">
              {panelTab === "chat" ? (
                <div className="members-chat-launchpad">
                  <section className="members-quick-actions">
                    <div className="members-quick-actions__header">
                      <strong>{copy.quickActions}</strong>
                      <p className="card__description">{copy.quickActionsBody}</p>
                    </div>
                    <div className="members-quick-actions__grid">
                      {quickActionTemplates.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            className="members-quick-action"
                            key={action.id}
                            onClick={() => handleSelectQuickAction(action.buildPrompt(selectedMember))}
                            type="button"
                          >
                            <Icon size={16} />
                            <span>{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="members-chat-preview">
                    <div className="members-chat-preview__bubble members-chat-preview__bubble--assistant">
                      <MemberAvatar
                        avatar={selectedMember.avatar}
                        className="members-chat-preview__avatar"
                        name={selectedMember.name}
                      />
                      <div>
                        <strong>{selectedMember.name}</strong>
                        <p>{memberGreeting(selectedMember)}</p>
                      </div>
                    </div>
                    {launchDraft ? (
                      <div className="members-chat-preview__bubble members-chat-preview__bubble--user">
                        <div>
                          <strong>{copy.youLabel}</strong>
                          <p>{launchDraft}</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="members-chat-preview__hint">
                      <Sparkles size={16} />
                      <span>{copy.launchHint}</span>
                    </div>
                  </section>

                  <section className="members-chat-composer">
                    <FieldLabel htmlFor="members-launch-draft">{copy.launchPromptLabel}</FieldLabel>
                    <Textarea
                      id="members-launch-draft"
                      rows={4}
                      placeholder={copy.launchPromptPlaceholder}
                      value={launchDraft}
                      onChange={(event) => setLaunchDraft(event.target.value)}
                    />
                    <div className="actions-row" style={{ justifyContent: "flex-end" }}>
                      <Button variant="outline" onClick={() => openChat("new")}>
                        <Plus size={14} />
                        {copy.startNewChat}
                      </Button>
                      <Button onClick={() => openChat("reuse-recent")}>
                        <MessageSquare size={14} />
                        {copy.openChatWorkspace}
                      </Button>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="members-task-grid">
                  <Card className="members-detail-card">
                    <CardContent className="panel-stack">
                      <div className="members-detail-card__eyebrow">
                        <Clock3 size={16} />
                        <span>{copy.activeTasksLabel}</span>
                      </div>
                      <strong>{memberTaskLabel(selectedMember.activeTaskCount)}</strong>
                      <p className="card__description">{selectedMember.currentStatus}</p>
                    </CardContent>
                  </Card>
                  <Card className="members-detail-card">
                    <CardContent className="panel-stack">
                      <div className="members-detail-card__eyebrow">
                        <Brain size={16} />
                        <span>{copy.brainLabel}</span>
                      </div>
                      <strong>{selectedMember.brain?.label ?? copy.brainFallback}</strong>
                      <p className="card__description">{selectedMember.brain?.modelKey ?? copy.brainFallbackBody}</p>
                    </CardContent>
                  </Card>
                  <Card className="members-detail-card">
                    <CardContent className="panel-stack">
                      <div className="members-detail-card__eyebrow">
                        <Sparkles size={16} />
                        <span>{copy.capabilitiesLabel}</span>
                      </div>
                      <strong>
                        {selectedMember.capabilitySettings.memoryEnabled ? copy.memoryEnabled : copy.memoryDisabled}
                      </strong>
                      <p className="card__description">{`${copy.contextWindowLabel} ${selectedMember.capabilitySettings.contextWindow}`}</p>
                    </CardContent>
                  </Card>
                  <Card className="members-detail-card">
                    <CardContent className="panel-stack">
                      <div className="members-detail-card__eyebrow">
                        <Link2 size={16} />
                        <span>{copy.bindingsLabel}</span>
                      </div>
                      <strong>{`${selectedMember.bindingCount} ${selectedMember.bindingCount === 1 ? copy.bindingSingular : copy.bindingPlural}`}</strong>
                      <p className="card__description">{bindingsLoading ? copy.loadingBindings : copy.bindingsBody}</p>
                    </CardContent>
                  </Card>

                  <Card className="members-detail-section">
                    <CardHeader>
                      <CardTitle>{copy.statusLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="panel-stack">
                      <p className="card__description">{selectedMember.currentStatus}</p>
                      <div className="actions-row">
                        {extractTraitBadges(selectedMember.personality).map((trait) => (
                          <Badge key={trait} tone="info">{trait}</Badge>
                        ))}
                        {selectedMember.workStyles.map((style) => (
                          <Badge key={style} tone="neutral">{style}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="members-detail-section">
                    <CardHeader>
                      <CardTitle>{copy.soulLabel}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="card__description">{selectedMember.soul || copy.soulFallback}</p>
                    </CardContent>
                  </Card>

                  <Card className="members-detail-section">
                    <CardHeader>
                      <CardTitle>{copy.skillsLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="skill-chip-grid">
                      {selectedMember.skillIds.length > 0 ? selectedMember.skillIds.map((skillId) => {
                        const label = overview?.skillOptions.find((skill) => skill.id === skillId)?.label ?? skillId;
                        const Icon = skillIconForLabel(label);
                        return (
                          <span className="members-skill-pill" key={skillId}>
                            <Icon size={14} />
                            <span>{label}</span>
                          </span>
                        );
                      }) : <span className="card__description">{copy.skillsFallback}</span>}
                    </CardContent>
                  </Card>

                  <Card className="members-detail-section">
                    <CardHeader>
                      <CardTitle>{copy.knowledgeLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="skill-chip-grid">
                      {selectedMember.knowledgePackIds.length > 0 ? selectedMember.knowledgePackIds.map((packId) => (
                        <Badge key={packId} tone="neutral">
                          {overview?.knowledgePacks.find((pack) => pack.id === packId)?.label ?? packId}
                        </Badge>
                      )) : <span className="card__description">{copy.knowledgeFallback}</span>}
                    </CardContent>
                  </Card>

                  <Card className="members-detail-section">
                    <CardHeader>
                      <CardTitle>{copy.bindingsLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="skill-chip-grid">
                      {bindingsLoading ? <span className="card__description">{copy.loadingBindings}</span> : null}
                      {!bindingsLoading && memberBindings.length > 0 ? memberBindings.map((binding) => (
                        <Badge key={binding.id} tone="neutral">
                          {binding.target}
                        </Badge>
                      )) : null}
                      {!bindingsLoading && memberBindings.length === 0 ? <span className="card__description">{copy.bindingsFallback}</span> : null}
                    </CardContent>
                  </Card>

                  <div className="members-panel__footer-actions">
                    <Button variant="outline" onClick={() => openChat("new")}>
                      <Plus size={14} />
                      {copy.startNewChat}
                    </Button>
                    <Button onClick={() => openChat("reuse-recent")}>
                      <CheckCircle2 size={14} />
                      {copy.openChatWorkspace}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </WorkspaceScaffold>
  );
}
