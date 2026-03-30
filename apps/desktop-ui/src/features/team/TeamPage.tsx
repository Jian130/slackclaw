import { ArrowRight, MessageSquare, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SaveTeamRequest, TeamDetail } from "@slackclaw/contracts";

import { useAITeam } from "../../app/providers/AITeamProvider.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { runTask } from "../../shared/api/client.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { ErrorState } from "../../shared/ui/ErrorState.js";
import { FieldLabel, Input, Textarea } from "../../shared/ui/Field.js";
import { LoadingBlocker } from "../../shared/ui/LoadingBlocker.js";
import { LoadingPanel } from "../../shared/ui/LoadingPanel.js";
import { MemberAvatar } from "../../shared/ui/MemberAvatar.js";
import { WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";

function TeamDialog(props: {
  open: boolean;
  team?: TeamDetail;
  onClose: () => void;
}) {
  const { overview, saveTeam } = useAITeam();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setName(props.team?.name ?? "");
    setPurpose(props.team?.purpose ?? "");
    setMemberIds(props.team?.memberIds ?? []);
    setError(undefined);
  }, [props.open, props.team]);

  function toggle(memberId: string) {
    setMemberIds((current) => (current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]));
  }

  async function handleSave() {
    setBusy(true);
    setError(undefined);

    try {
      const request: SaveTeamRequest = {
        name,
        purpose,
        memberIds
      };
      await saveTeam(props.team?.id, request);
      props.onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "ChillClaw could not save this AI team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.team ? "Edit AI Team" : "Create AI Team"}
      description="Group AI members into reusable teams for routing and oversight."
      wide
    >
      <LoadingBlocker active={busy} label="Saving AI team" description="ChillClaw is saving the team configuration.">
        <div className="panel-stack">
          {error ? <ErrorState compact title="Could not save AI team" description={error} /> : null}
          <div className="field-grid">
            <div>
              <FieldLabel htmlFor="team-name">Team name</FieldLabel>
              <Input id="team-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="team-purpose">Purpose</FieldLabel>
              <Textarea id="team-purpose" rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </div>
          </div>

          <div>
            <FieldLabel>Members</FieldLabel>
            <div className="skill-chip-grid">
              {overview?.members.map((member) => (
                <button
                  key={member.id}
                  className={`badge ${memberIds.includes(member.id) ? "badge--success" : "badge--neutral"}`}
                  onClick={() => toggle(member.id)}
                  type="button"
                >
                  {member.name}
                </button>
              ))}
            </div>
          </div>

          <div className="actions-row" style={{ justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={props.onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} loading={busy}>
              {busy ? "Saving..." : "Save Team"}
            </Button>
          </div>
        </div>
      </LoadingBlocker>
    </Dialog>
  );
}

export default function TeamPage() {
  const { locale } = useLocale();
  const copy = t(locale).team;
  const { overview: appOverview } = useOverview();
  const { overview, loading, error, removeTeam } = useAITeam();
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const [selectedMemberId, setSelectedMemberId] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamDetail>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const teams = overview?.teams ?? [];
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  const teamMembers = useMemo(
    () => overview?.members.filter((member) => selectedTeam?.memberIds.includes(member.id)) ?? [],
    [overview?.members, selectedTeam?.memberIds]
  );
  const selectedMember = teamMembers.find((member) => member.id === selectedMemberId) ?? teamMembers[0];

  async function handleDeleteTeam(team: TeamDetail) {
    if (!window.confirm(`Delete ${team.name}?`)) {
      return;
    }

    await removeTeam(team.id);
    setSelectedTeamId(undefined);
  }

  async function handleSend() {
    if (!draft.trim() || !selectedMember) {
      return;
    }

    setBusy(true);
    const prompt = draft.trim();
    setMessages((current) => [...current, { role: "user", content: prompt }]);
    setDraft("");

    try {
      const result = await runTask({
        prompt,
        profileId: appOverview?.firstRun.selectedProfileId ?? "email-admin",
        memberId: selectedMember.id
      });

      setMessages((current) => [...current, { role: "assistant", content: result.output }]);
    } catch (taskError) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: taskError instanceof Error ? taskError.message : "ChillClaw could not reach the selected AI member."
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <LoadingPanel title="Loading AI teams" description="ChillClaw is reading team rosters and AI member assignments." />
      </WorkspaceScaffold>
    );
  }

  if (error && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <ErrorState
          title="ChillClaw could not load AI teams"
          description={error}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      </WorkspaceScaffold>
    );
  }

  return (
    <WorkspaceScaffold
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <Button
          onClick={() => {
            setEditingTeam(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus size={14} />
          Create AI Team
        </Button>
      }
    >

      <Card>
        <CardContent className="actions-row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{copy.vision}</strong>
            <p className="card__description">{overview?.teamVision}</p>
          </div>
          <Badge tone="info">{teams.length} teams</Badge>
        </CardContent>
      </Card>

      <div className="split-layout">
        <div className="employee-grid">
          {teams.map((team) => (
            <button className="employee-card" key={team.id} onClick={() => setSelectedTeamId(team.id)} type="button">
              <div className="employee-card__avatar" style={{ background: "var(--avatar-2)" }}>
                {team.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="employee-details">
                <strong>{team.name}</strong>
                <span className="card__description">{team.purpose || "No team brief yet."}</span>
                <div className="actions-row">
                  <Badge tone="success">{team.memberCount} members</Badge>
                </div>
                <div className="actions-row" style={{ color: "var(--primary)" }}>
                  <Users size={14} />
                  <span>Manage roster</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            </button>
          ))}
          {teams.length === 0 ? (
            <EmptyState
              title="No AI teams yet"
              description="Create a team to organize members and route work to a specific specialist."
              actionLabel="Create AI Team"
              onAction={() => setDialogOpen(true)}
            />
          ) : null}
        </div>

        <Card>
          <CardContent className="panel-stack">
            {selectedTeam ? (
              <>
                <div className="actions-row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{selectedTeam.name}</strong>
                    <p className="card__description">{selectedTeam.purpose || "No team brief yet."}</p>
                  </div>
                  <div className="actions-row">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingTeam(selectedTeam);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="outline" onClick={() => void handleDeleteTeam(selectedTeam)}>
                      <Trash2 size={14} />
                      Remove
                    </Button>
                  </div>
                </div>

                <Card>
                  <CardContent className="panel-stack">
                    <strong>Assigned members</strong>
                    <div className="employee-grid">
                      {teamMembers.map((member) => (
                        <button
                          className="employee-card"
                          key={member.id}
                          onClick={() => setSelectedMemberId(member.id)}
                          type="button"
                        >
                          <MemberAvatar
                            avatar={member.avatar}
                            className="employee-card__avatar"
                            name={member.name}
                            style={{ background: member.avatar.accent }}
                          />
                          <div className="employee-details">
                            <strong>{member.name}</strong>
                            <span className="card__description">{member.jobTitle}</span>
                            {member.brain ? <Badge tone="neutral">{member.brain.label}</Badge> : null}
                          </div>
                        </button>
                      ))}
                      {teamMembers.length === 0 ? <p className="card__description">Add members to this team from Edit.</p> : null}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="panel-stack">
                    <div className="actions-row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{selectedMember?.name ?? "Select a team member"}</strong>
                        <p className="card__description">{selectedMember?.jobTitle ?? "Choose a team member to route work."}</p>
                      </div>
                      {selectedMember ? (
                        <Badge tone="info">{selectedMember.brain?.label ?? "Brain pending"}</Badge>
                      ) : null}
                    </div>
                    <div className="message-list">
                      {messages.length > 0 ? messages.map((message, index) => (
                        <div
                          className={`message-bubble message-bubble--${message.role === "user" ? "user" : "assistant"}`}
                          key={`${message.role}-${index}`}
                        >
                          {message.content}
                        </div>
                      )) : (
                        <p className="card__description">Send a task to a selected team member. ChillClaw will route it through that member’s OpenClaw agent.</p>
                      )}
                    </div>
                    <div className="actions-row">
                      <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={selectedMember ? `Ask ${selectedMember.name} to handle something...` : "Select a team member first"}
                      />
                      <Button onClick={() => void handleSend()} disabled={!selectedMember} loading={busy}>
                        <MessageSquare size={14} />
                        {busy ? "Sending..." : copy.chat}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="card__description">Select a team to manage its roster and route work to a specific AI member.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TeamDialog open={dialogOpen} team={editingTeam} onClose={() => setDialogOpen(false)} />
    </WorkspaceScaffold>
  );
}
