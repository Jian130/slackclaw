import { AlertTriangle, Package, Plug, RefreshCw, Trash2, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ManagedPluginEntry, ManagedPluginStatus, PluginConfigOverview } from "@slackclaw/contracts";

import { useLocale } from "../../app/providers/LocaleProvider.js";
import { fetchPluginConfig, installPlugin, removePlugin, updatePlugin } from "../../shared/api/client.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";
import { t } from "../../shared/i18n/messages.js";
import { Badge } from "../../shared/ui/Badge.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";
import { ErrorState } from "../../shared/ui/ErrorState.js";
import { InfoBanner } from "../../shared/ui/InfoBanner.js";
import { LoadingState } from "../../shared/ui/LoadingState.js";
import { MetricCard } from "../../shared/ui/MetricCard.js";
import { WorkspaceScaffold } from "../../shared/ui/Scaffold.js";
import { StatusBadge } from "../../shared/ui/StatusBadge.js";

type PluginActionKind = "install" | "update" | "remove";

export function pluginStatusTone(status: ManagedPluginStatus): "success" | "warning" | "info" | "neutral" {
  switch (status) {
    case "ready":
      return "success";
    case "update-available":
      return "info";
    case "blocked":
    case "error":
      return "warning";
    case "missing":
    default:
      return "neutral";
  }
}

export function pluginStatusLabel(status: ManagedPluginStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "update-available":
      return "Update Available";
    case "blocked":
      return "Blocked";
    case "error":
      return "Needs Repair";
    case "missing":
    default:
      return "Missing";
  }
}

export function pluginPrimaryAction(entry: ManagedPluginEntry): PluginActionKind | undefined {
  if (!entry.installed) {
    return "install";
  }
  if (entry.hasUpdate) {
    return "update";
  }
  if (entry.activeDependentCount === 0) {
    return "remove";
  }
  return undefined;
}

function actionLabel(action: PluginActionKind, busy: boolean): string {
  switch (action) {
    case "install":
      return busy ? "Installing..." : "Install";
    case "update":
      return busy ? "Updating..." : "Update";
    case "remove":
      return busy ? "Removing..." : "Remove";
  }
}

export default function PluginsPage() {
  const { locale } = useLocale();
  const copy = t(locale).plugins;
  const [overview, setOverview] = useState<PluginConfigOverview>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    void loadPlugins({ fresh: true });

    return subscribeToDaemonEvents((event) => {
      if (event.type === "plugin-config.updated") {
        setOverview(event.snapshot.data);
        setError(undefined);
        setLoading(false);
      }
    });
  }, []);

  async function loadPlugins(options?: { fresh?: boolean }) {
    if (overview) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setOverview(await fetchPluginConfig(options));
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ChillClaw could not load the managed plugin inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function runAction(entry: ManagedPluginEntry, action: PluginActionKind) {
    const key = `${entry.id}:${action}`;
    setBusyKey(key);
    setError(undefined);

    try {
      const response =
        action === "install"
          ? await installPlugin(entry.id)
          : action === "update"
            ? await updatePlugin(entry.id)
            : await removePlugin(entry.id);
      setOverview(response.pluginConfig);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `ChillClaw could not ${action} ${entry.label}.`);
    } finally {
      setBusyKey("");
    }
  }

  const metrics = useMemo(() => {
    const entries = overview?.entries ?? [];
    return {
      total: entries.length,
      ready: entries.filter((entry) => entry.status === "ready").length,
      active: entries.reduce((count, entry) => count + entry.activeDependentCount, 0),
      updates: entries.filter((entry) => entry.hasUpdate).length
    };
  }, [overview]);

  if (loading && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <LoadingState title={copy.loadingTitle} description={copy.loadingBody} />
      </WorkspaceScaffold>
    );
  }

  if (error && !overview) {
    return (
      <WorkspaceScaffold title={copy.title} subtitle={copy.subtitle}>
        <ErrorState title="Managed plugins are unavailable" description={error} />
      </WorkspaceScaffold>
    );
  }

  return (
    <WorkspaceScaffold
      title={copy.title}
      subtitle={copy.subtitle}
      actions={(
        <Button onClick={() => void loadPlugins({ fresh: true })} variant="outline">
          <RefreshCw size={14} />
          {refreshing ? `${copy.refresh}...` : copy.refresh}
        </Button>
      )}
    >
      <div className="panel-stack">
        <InfoBanner
          accent="blue"
          icon={<Plug size={22} />}
          title="Daemon-owned plugin lifecycle"
          description="ChillClaw installs, updates, and removes managed OpenClaw plugins itself. Features such as WeChat depend on these plugin records, so removal is blocked while a live feature still needs the plugin."
        />

        {error ? <ErrorState compact title="Plugin action failed" description={error} /> : null}

        <div className="metrics-grid">
          <MetricCard label={copy.total} value={metrics.total} />
          <MetricCard label={copy.ready} value={metrics.ready} />
          <MetricCard label={copy.active} value={metrics.active} />
          <MetricCard label={copy.updates} value={metrics.updates} />
        </div>

        {!overview?.entries.length ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
        ) : (
          <div className="card-grid">
            {overview.entries.map((entry) => {
              const primaryAction = pluginPrimaryAction(entry);
              const actionBusy = primaryAction ? busyKey === `${entry.id}:${primaryAction}` : false;

              return (
                <Card key={entry.id}>
                  <CardContent className="panel-stack">
                    <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div className="panel-stack" style={{ gap: 6 }}>
                        <div className="actions-row">
                          <strong>{entry.label}</strong>
                          <StatusBadge tone={pluginStatusTone(entry.status)}>{pluginStatusLabel(entry.status)}</StatusBadge>
                        </div>
                        <span className="card__description">{entry.summary}</span>
                      </div>
                      <Badge tone={entry.enabled ? "success" : "neutral"}>{entry.enabled ? "Enabled" : "Disabled"}</Badge>
                    </div>

                    <div className="actions-row" style={{ flexWrap: "wrap" }}>
                      <Badge tone="neutral">{entry.packageSpec}</Badge>
                      <Badge tone="neutral">{entry.runtimePluginId}</Badge>
                      {entry.hasUpdate ? <Badge tone="info">Update available</Badge> : null}
                      {entry.hasError ? <Badge tone="warning">Load error</Badge> : null}
                      {entry.activeDependentCount > 0 ? <Badge tone="warning">{entry.activeDependentCount} active dependent</Badge> : null}
                    </div>

                    <p className="card__description">{entry.detail}</p>

                    <div className="field-grid field-grid--two">
                      <div>
                        <strong>Config key</strong>
                        <p className="card__description">{entry.configKey}</p>
                      </div>
                      <div>
                        <strong>Dependent features</strong>
                        <p className="card__description">
                          {entry.dependencies.length > 0
                            ? entry.dependencies.map((dependency) => dependency.label).join(", ")
                            : "None"}
                        </p>
                      </div>
                    </div>

                    {entry.activeDependentCount > 0 ? (
                      <div className="actions-row" style={{ alignItems: "flex-start" }}>
                        <AlertTriangle size={16} />
                        <span className="card__description">
                          Remove the active dependent feature before uninstalling this plugin. ChillClaw will keep the
                          plugin installed while the feature remains configured.
                        </span>
                      </div>
                    ) : null}

                    <div className="actions-row" style={{ justifyContent: "flex-end" }}>
                      {primaryAction ? (
                        <Button
                          loading={actionBusy}
                          onClick={() => void runAction(entry, primaryAction)}
                          variant={primaryAction === "remove" ? "danger" : primaryAction === "update" ? "secondary" : "primary"}
                        >
                          {primaryAction === "install" ? <Package size={14} /> : primaryAction === "update" ? <Wrench size={14} /> : <Trash2 size={14} />}
                          {actionLabel(primaryAction, actionBusy)}
                        </Button>
                      ) : (
                        <Button disabled variant="outline">
                          Managed by active features
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </WorkspaceScaffold>
  );
}
