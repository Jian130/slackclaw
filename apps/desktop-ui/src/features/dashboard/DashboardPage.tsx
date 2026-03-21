import { useEffect, useState } from "react";
import { Activity, ArrowRight, Brain, CheckCircle2, Shield, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { ModelConfigOverview, ProductOverview } from "@slackclaw/contracts";

import { useAITeam } from "../../app/providers/AITeamProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { fetchModelConfig } from "../../shared/api/client.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { MemberAvatar } from "../../shared/ui/MemberAvatar.js";
import { MetricCard } from "../../shared/ui/MetricCard.js";
import { PageHeader } from "../../shared/ui/PageHeader.js";

function toneColor(tone: string) {
  if (tone === "completed") return "#16a34a";
  if (tone === "started") return "#2563eb";
  if (tone === "generated") return "#7c3aed";
  if (tone === "updated") return "#d97706";
  return "#4f46e5";
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

  if (modelConfig?.defaultModel) {
    return modelConfig.defaultModel;
  }

  return "No configured models";
}

export default function DashboardPage() {
  const { locale } = useLocale();
  const copy = t(locale).dashboard;
  const { overview, refresh } = useOverview();
  const { overview: aiTeam } = useAITeam();
  const [modelConfig, setModelConfig] = useState<ModelConfigOverview>();
  const readyCount = aiTeam?.members.filter((member) => member.status === "ready").length ?? 0;
  const busyCount = aiTeam?.members.filter((member) => member.status === "busy").length ?? 0;
  const channelReady = overview?.channelSetup.channels.filter((channel) => channel.status === "completed" || channel.status === "ready").length ?? 0;

  useEffect(() => {
    void refresh({ fresh: true });
    void fetchModelConfig({ fresh: true })
      .then((next) => setModelConfig(next))
      .catch(() => setModelConfig(undefined));
  }, [refresh]);

  return (
    <div className="panel-stack">
      <PageHeader
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
        subtitle={copy.subtitle}
        title={copy.title}
      />

      <div className="hero-banner">
        <div className="actions-row" style={{ marginBottom: 14 }}>
          <Badge tone="info">
            <Sparkles size={14} />
            Powered by OpenClaw
          </Badge>
          <Badge tone="success">
            <CheckCircle2 size={14} />
            Workspace active
          </Badge>
          <Badge tone="neutral">
            <Brain size={14} />
            {overview?.engine.version ?? overview?.installSpec.desiredVersion}
          </Badge>
        </div>
        <h2>Figma shell, backend-truthful state</h2>
        <p>The layout follows the new main-file dashboard while the metrics now come from the daemon-backed AI member and AI team catalog.</p>
      </div>

      <div className="grid--metrics">
        <MetricCard detail={overview?.engine.summary} label="Engine" value={overview?.engine.installed ? "Installed" : "Missing"} />
        <MetricCard
          detail={connectedModelDetail(overview, modelConfig)}
          label="Connected Models"
          value={connectedModelCount(modelConfig)}
        />
        <MetricCard detail={`${readyCount} ready / ${busyCount} busy`} label="AI Members" value={aiTeam?.members.length ?? 0} />
        <MetricCard detail="In Progress" label="Active Tasks" value={aiTeam?.members.reduce((total, member) => total + member.activeTaskCount, 0) ?? 0} />
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
                        <Badge tone={member.status === "ready" ? "success" : member.status === "busy" ? "info" : "neutral"}>
                          {member.status}
                        </Badge>
                        {member.activeTaskCount ? <Badge tone="neutral">{member.activeTaskCount} active</Badge> : null}
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
                      <div className="channel-logo" style={{ background: toneColor(item.tone), color: "white" }}>
                        {(item.memberName ?? "S")[0]}
                      </div>
                      <div className="check-row__meta">
                        <strong>{item.action}</strong>
                        <p>{item.description}</p>
                        <p>{item.memberName ?? "SlackClaw"} · {item.timestamp}</p>
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
                <div className="check-row"><strong>OpenClaw deployed</strong><Badge tone={overview?.engine.installed ? "success" : "warning"}>{overview?.engine.installed ? "Active" : "Missing"}</Badge></div>
                <div className="check-row"><strong>Gateway reachable</strong><Badge tone={overview?.engine.running ? "success" : "warning"}>{overview?.engine.running ? "Running" : "Stopped"}</Badge></div>
                <div className="check-row"><strong>Channels configured</strong><Badge tone={channelReady ? "success" : "warning"}>{channelReady ? `${channelReady} ready` : "Pending"}</Badge></div>
                <div className="check-row"><strong>Health blockers</strong><Badge tone={overview?.healthChecks.some((check) => check.severity === "error") ? "warning" : "success"}>{overview?.healthChecks.some((check) => check.severity === "error") ? "Review" : "Clear"}</Badge></div>
                <div className="check-row"><strong>AI member roster</strong><Badge tone="info">{aiTeam?.members.length ?? 0} members</Badge></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
