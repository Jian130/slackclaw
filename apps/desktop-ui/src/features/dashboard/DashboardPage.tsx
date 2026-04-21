import { useEffect, useState } from "react";
import { Activity, ArrowRight, Brain, CheckCircle2, Shield, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { CapabilityOverview, CapabilityStatus, ChillClawEvent, ModelConfigOverview, ProductOverview, ToolOverview } from "@chillclaw/contracts";

import { useAITeam } from "../../app/providers/AITeamProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { fetchCapabilityOverview, fetchModelConfig, fetchToolOverview } from "../../shared/api/client.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";
import { t } from "../../shared/i18n/messages.js";
import { TagBadge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { InfoBanner } from "../../shared/ui/InfoBanner.js";
import { MemberAvatar } from "../../shared/ui/MemberAvatar.js";
import { MetricCard } from "../../shared/ui/MetricCard.js";
import { WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { StatusBadge } from "../../shared/ui/StatusBadge.js";
import { appUpdateDownloadLabel, openAppUpdateDownload } from "../settings/app-updates.js";

function toneColor(tone: string) {
  if (tone === "completed") return "var(--success)";
  if (tone === "started") return "var(--primary)";
  if (tone === "generated") return "var(--accent)";
  if (tone === "updated") return "var(--warning)";
  return "var(--accent-strong)";
}

export function connectedModelCount(modelConfig: ModelConfigOverview | undefined): number {
  return modelConfig?.configuredModelKeys.length ?? 0;
}

export function connectedModelDetail(
  overview: ProductOverview | undefined,
  modelConfig: ModelConfigOverview | undefined
): string {
  if (!overview?.engine.installed) {
    return "OpenClaw is not installed.";
  }

  if (overview.localRuntime?.activeInOpenClaw) {
    return overview.localRuntime.summary;
  }

  if (modelConfig?.defaultModel) {
    return modelConfig.defaultModel;
  }

  return "No configured models";
}

const READY_STATUSES: CapabilityStatus[] = ["ready"];
const ATTENTION_STATUSES: CapabilityStatus[] = ["missing", "disabled", "blocked", "error"];

export function capabilityReadyCount(capabilityOverview: CapabilityOverview | undefined): number {
  return capabilityOverview?.entries.filter((entry) => READY_STATUSES.includes(entry.status)).length ?? 0;
}

export function capabilityReadinessDetail(capabilityOverview: CapabilityOverview | undefined): string {
  return capabilityOverview?.summary ?? "Capability readiness is loading.";
}

export function toolReadyCount(toolOverview: ToolOverview | undefined): number {
  return toolOverview?.entries.filter((entry) => READY_STATUSES.includes(entry.status)).length ?? 0;
}

export function toolReadinessDetail(toolOverview: ToolOverview | undefined): string {
  return toolOverview?.summary ?? "Tool access is loading.";
}

function hasCapabilityAttention(capabilityOverview: CapabilityOverview | undefined): boolean {
  return capabilityOverview?.entries.some((entry) => ATTENTION_STATUSES.includes(entry.status)) ?? false;
}

function hasToolAttention(toolOverview: ToolOverview | undefined): boolean {
  return toolOverview?.entries.some((entry) => ATTENTION_STATUSES.includes(entry.status)) ?? false;
}

export function shouldRefreshDashboardCapabilitySnapshotsForEvent(event: ChillClawEvent): boolean {
  return (
    event.type === "skill-catalog.updated" ||
    event.type === "preset-skill-sync.updated" ||
    event.type === "plugin-config.updated" ||
    event.type === "channel-config.updated" ||
    event.type === "config.applied" ||
    event.type === "deploy.completed" ||
    event.type === "gateway.status"
  );
}

export default function DashboardPage() {
  const { locale } = useLocale();
  const copy = t(locale).dashboard;
  const { overview } = useOverview();
  const { overview: aiTeam } = useAITeam();
  const [modelConfig, setModelConfig] = useState<ModelConfigOverview>();
  const [capabilityOverview, setCapabilityOverview] = useState<CapabilityOverview>();
  const [toolOverview, setToolOverview] = useState<ToolOverview>();
  const readyCount = aiTeam?.members.filter((member) => member.status === "ready").length ?? 0;
  const busyCount = aiTeam?.members.filter((member) => member.status === "busy").length ?? 0;
  const channelReady = overview?.channelSetup.channels.filter((channel) => channel.status === "completed" || channel.status === "ready").length ?? 0;

  useEffect(() => {
    let cancelled = false;
    const refreshDashboardSnapshots = async () => {
      const [nextModelConfig, nextCapabilityOverview, nextToolOverview] = await Promise.all([
        fetchModelConfig(),
        fetchCapabilityOverview({ fresh: true }),
        fetchToolOverview({ fresh: true })
      ]);

      if (cancelled) {
        return;
      }

      setModelConfig(nextModelConfig);
      setCapabilityOverview(nextCapabilityOverview);
      setToolOverview(nextToolOverview);
    };

    void refreshDashboardSnapshots()
      .catch(() => {
        if (cancelled) {
          return;
        }
        setModelConfig(undefined);
        setCapabilityOverview(undefined);
        setToolOverview(undefined);
      });

    const unsubscribe = subscribeToDaemonEvents((event) => {
      if (!shouldRefreshDashboardCapabilitySnapshotsForEvent(event)) {
        return;
      }

      void Promise.all([fetchCapabilityOverview({ fresh: true }), fetchToolOverview({ fresh: true })])
        .then(([nextCapabilityOverview, nextToolOverview]) => {
          if (cancelled) {
            return;
          }
          setCapabilityOverview(nextCapabilityOverview);
          setToolOverview(nextToolOverview);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setCapabilityOverview(undefined);
          setToolOverview(undefined);
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <WorkspaceScaffold
      contentWidth="full"
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <>
          <Link to="/members">
            <Button size="lg">
              <Users size={16} />
              {copy.createEmployee}
            </Button>
          </Link>
          <Link to="/team">
            <Button size="lg" variant="outline">
              {copy.openTeam}
            </Button>
          </Link>
        </>
      }
    >
      <InfoBanner
        accent="blue"
        icon={<Sparkles size={22} />}
        title="Figma shell, backend-truthful state"
        description="The layout follows the new main-file dashboard while the metrics now come from the daemon-backed AI member and AI team catalog."
      >
        <div className="actions-row">
          <TagBadge tone="info">
            <Sparkles size={14} />
            Powered by OpenClaw
          </TagBadge>
          <StatusBadge tone="success">
            <CheckCircle2 size={14} />
            Workspace active
          </StatusBadge>
          <TagBadge tone="neutral">
            <Brain size={14} />
            {overview?.engine.version ?? overview?.installSpec.desiredVersion}
          </TagBadge>
        </div>
      </InfoBanner>

      {overview?.appUpdate?.status === "update-available" ? (
        <InfoBanner
          accent="orange"
          icon={<CheckCircle2 size={22} />}
          title={copy.appUpdateBannerTitle}
          description={overview.appUpdate.summary}
        >
          <div className="actions-row">
            <StatusBadge tone="warning">{copy.appUpdateAvailable}</StatusBadge>
            <Button
              onClick={() => {
                openAppUpdateDownload(overview.appUpdate);
              }}
              variant="outline"
            >
              {appUpdateDownloadLabel(overview.appUpdate, copy.downloadUpdate)}
            </Button>
          </div>
        </InfoBanner>
      ) : null}

      <div className="grid--metrics">
        <MetricCard detail={overview?.engine.summary} label="Engine" value={overview?.engine.installed ? "Installed" : "Missing"} />
        <MetricCard
          detail={connectedModelDetail(overview, modelConfig)}
          label="Connected Models"
          value={connectedModelCount(modelConfig)}
        />
        <MetricCard detail={`${readyCount} ready / ${busyCount} busy`} label="AI Members" value={aiTeam?.members.length ?? 0} />
        <MetricCard detail="In Progress" label="Active Tasks" value={aiTeam?.members.reduce((total, member) => total + member.activeTaskCount, 0) ?? 0} />
        <MetricCard detail={capabilityReadinessDetail(capabilityOverview)} label="Capabilities Ready" value={capabilityReadyCount(capabilityOverview)} />
        <MetricCard detail={toolReadinessDetail(toolOverview)} label="Tools Ready" value={toolReadyCount(toolOverview)} />
        <MetricCard detail={overview?.channelSetup.gatewaySummary} label="Channels Ready" value={channelReady} />
      </div>

      <div className="split-layout">
        <Card>
          <CardContent className="panel-stack">
            <div className="actions-row" style={{ justifyContent: "space-between" }}>
              <strong>{copy.employeeStatus}</strong>
              <Link to="/team">
                <Button variant="ghost">
                  View all
                  <ArrowRight size={14} />
                </Button>
              </Link>
            </div>
            <div className="employee-grid">
              {aiTeam?.members.map((member) => (
                <div className="employee-card" key={member.id}>
                  <div className="actions-row" style={{ gap: 16, alignItems: "center" }}>
                    <MemberAvatar
                      avatar={member.avatar}
                      className="employee-card__avatar"
                      name={member.name}
                      style={{ background: member.avatar.accent, width: 72, minWidth: 72, aspectRatio: "1" }}
                    />
                    <div className="employee-details">
                      <strong>{member.name}</strong>
                      <span className="card__description">{member.jobTitle}</span>
                      <div className="actions-row">
                        <StatusBadge tone={member.status === "ready" ? "success" : member.status === "busy" ? "info" : "neutral"}>
                          {member.status}
                        </StatusBadge>
                        {member.activeTaskCount ? <StatusBadge tone="neutral">{member.activeTaskCount} active</StatusBadge> : null}
                      </div>
                    </div>
                  </div>
                  <p className="card__description" style={{ marginTop: 12 }}>{member.currentStatus}</p>
                </div>
              )) ?? null}
            </div>
          </CardContent>
        </Card>

        <div className="panel-stack">
          <Card>
            <CardContent className="panel-stack">
              <div className="actions-row">
                <Activity size={18} />
                <strong>{copy.recentActivity}</strong>
              </div>
              <div className="activity-list">
                {aiTeam?.activity.map((item) => (
                  <div className="check-row" key={item.id}>
                    <div className="actions-row" style={{ alignItems: "start" }}>
                      <div className="channel-logo" style={{ background: toneColor(item.tone), color: "var(--white)" }}>
                        {(item.memberName ?? "S")[0]}
                      </div>
                      <div className="check-row__meta">
                        <strong>{item.action}</strong>
                        <p>{item.description}</p>
                        <p>{item.memberName ?? "ChillClaw"} · {item.timestamp}</p>
                      </div>
                    </div>
                  </div>
                )) ?? null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="panel-stack">
              <div className="actions-row">
                <Shield size={18} />
                <strong>{copy.workspaceHealth}</strong>
              </div>
              <div className="status-list">
                <div className="check-row"><strong>OpenClaw deployed</strong><StatusBadge tone={overview?.engine.installed ? "success" : "warning"}>{overview?.engine.installed ? "Active" : "Missing"}</StatusBadge></div>
                <div className="check-row"><strong>Gateway reachable</strong><StatusBadge tone={overview?.engine.running ? "success" : "warning"}>{overview?.engine.running ? "Running" : "Stopped"}</StatusBadge></div>
                <div className="check-row"><strong>Local AI runtime</strong><StatusBadge tone={overview?.localRuntime?.status === "ready" ? "success" : overview?.localRuntime?.status === "degraded" || overview?.localRuntime?.status === "failed" ? "warning" : "neutral"}>{overview?.localRuntime?.status === "ready" ? "Ready" : overview?.localRuntime?.status === "degraded" || overview?.localRuntime?.status === "failed" ? "Repair" : overview?.localRuntime?.recommendation === "local" ? "Available" : "Cloud"}</StatusBadge></div>
                <div className="check-row"><strong>Capabilities</strong><StatusBadge tone={hasCapabilityAttention(capabilityOverview) ? "warning" : capabilityOverview ? "success" : "neutral"}>{hasCapabilityAttention(capabilityOverview) ? "Review" : capabilityOverview ? "Ready" : "Loading"}</StatusBadge></div>
                <div className="check-row"><strong>Tools</strong><StatusBadge tone={hasToolAttention(toolOverview) ? "warning" : toolOverview ? "success" : "neutral"}>{hasToolAttention(toolOverview) ? "Review" : toolOverview ? "Ready" : "Loading"}</StatusBadge></div>
                <div className="check-row"><strong>Channels configured</strong><StatusBadge tone={channelReady ? "success" : "warning"}>{channelReady ? `${channelReady} ready` : "Pending"}</StatusBadge></div>
                <div className="check-row"><strong>Health blockers</strong><StatusBadge tone={overview?.healthChecks.some((check) => check.severity === "error") ? "warning" : "success"}>{overview?.healthChecks.some((check) => check.severity === "error") ? "Review" : "Clear"}</StatusBadge></div>
                <div className="check-row"><strong>AI member roster</strong><StatusBadge tone="info">{aiTeam?.members.length ?? 0} members</StatusBadge></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </WorkspaceScaffold>
  );
}
