import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  exportDiagnostics,
  installAppService,
  restartAppService,
  runUpdate,
  stopSlackClawApp,
  uninstallAppService,
  uninstallSlackClawApp
} from "../../shared/api/client.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { useWorkspace } from "../../app/providers/WorkspaceProvider.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { t } from "../../shared/i18n/messages.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/Card.js";
import { FieldLabel, Input, Select } from "../../shared/ui/Field.js";
import { PageHeader } from "../../shared/ui/PageHeader.js";
import { Switch } from "../../shared/ui/Switch.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/Tabs.js";
import { Badge } from "../../shared/ui/Badge.js";

export default function SettingsPage() {
  const { locale } = useLocale();
  const copy = t(locale).settings;
  const { overview, refresh } = useOverview();
  const { state, update } = useWorkspace();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function runAction(name: string, action: () => Promise<{ message?: string; path?: string } | void>) {
    setBusy(name);
    try {
      const result = await action();
      setMessage(result?.message ?? message);
      await refresh();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="panel-stack">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      {message ? <p className="card__description">{message}</p> : null}

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{copy.general}</TabsTrigger>
          <TabsTrigger value="deployment">{copy.deployment}</TabsTrigger>
          <TabsTrigger value="logging">{copy.logging}</TabsTrigger>
          <TabsTrigger value="advanced">{copy.advanced}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>{copy.general}</CardTitle>
            </CardHeader>
            <CardContent className="field-grid">
              <div>
                <FieldLabel htmlFor="instance-name">Instance Name</FieldLabel>
                <Input
                  id="instance-name"
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: { ...current.settings.general, instanceName: event.target.value }
                      }
                    }))
                  }
                  value={state.settings.general.instanceName}
                />
              </div>
              <div className="check-row"><div className="check-row__meta"><strong>Auto-start on boot</strong><p>Stored locally for the current SlackClaw workspace.</p></div><Switch checked={state.settings.general.autoStart} onCheckedChange={(checked) => update((current) => ({ ...current, settings: { ...current.settings, general: { ...current.settings.general, autoStart: checked } } }))} /></div>
              <div className="check-row"><div className="check-row__meta"><strong>Check for updates</strong><p>Keep SlackClaw aware of product updates.</p></div><Switch checked={state.settings.general.checkUpdates} onCheckedChange={(checked) => update((current) => ({ ...current, settings: { ...current.settings, general: { ...current.settings.general, checkUpdates: checked } } }))} /></div>
              <div className="check-row"><div className="check-row__meta"><strong>Send telemetry</strong><p>Frontend-local preference only until a daemon-backed setting exists.</p></div><Switch checked={state.settings.general.telemetry} onCheckedChange={(checked) => update((current) => ({ ...current, settings: { ...current.settings, general: { ...current.settings.general, telemetry: checked } } }))} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployment">
          <div className="panel-stack">
            <Card>
              <CardContent className="actions-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>App service</strong>
                  <p className="card__description">{overview?.appService.summary}</p>
                </div>
                <Badge tone={overview?.appService.running ? "success" : "warning"}>
                  {overview?.appService.running ? "Running" : "Stopped"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="actions-row">
                <Button loading={busy === "install-service"} onClick={() => void runAction("install-service", async () => (await installAppService()).result)}>{busy === "install-service" ? "Installing..." : copy.installService}</Button>
                <Button loading={busy === "restart-service"} onClick={() => void runAction("restart-service", async () => (await restartAppService()).result)} variant="outline">{busy === "restart-service" ? "Restarting..." : copy.restartService}</Button>
                <Button loading={busy === "remove-service"} onClick={() => void runAction("remove-service", async () => (await uninstallAppService()).result)} variant="outline">{busy === "remove-service" ? "Removing..." : copy.removeService}</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logging">
          <Card>
            <CardHeader>
              <CardTitle>{copy.logging}</CardTitle>
            </CardHeader>
            <CardContent className="field-grid">
              <div>
                <FieldLabel htmlFor="log-level">Log Level</FieldLabel>
                <Select
                  id="log-level"
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        logging: { ...current.settings.logging, level: event.target.value }
                      }
                    }))
                  }
                  value={state.settings.logging.level}
                >
                  <option value="error">Error only</option>
                  <option value="warn">Warnings and errors</option>
                  <option value="info">Info, warnings, and errors</option>
                  <option value="debug">Debug</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="retention">Log retention (days)</FieldLabel>
                <Input
                  id="retention"
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        logging: {
                          ...current.settings.logging,
                          retention: Number(event.target.value)
                        }
                      }
                    }))
                  }
                  type="number"
                  value={state.settings.logging.retention}
                />
              </div>
              <div className="check-row"><div className="check-row__meta"><strong>Enable debug mode</strong><p>Local UI preference until daemon-backed log settings expand.</p></div><Switch checked={state.settings.logging.enableDebug} onCheckedChange={(checked) => update((current) => ({ ...current, settings: { ...current.settings, logging: { ...current.settings.logging, enableDebug: checked } } }))} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced">
          <div className="panel-stack">
            <Card>
              <CardContent className="actions-row">
                <Button loading={busy === "diagnostics"} onClick={() => void runAction("diagnostics", exportDiagnostics)} variant="outline">
                  <Download size={14} />
                  {busy === "diagnostics" ? "Exporting..." : copy.exportDiagnostics}
                </Button>
                <Button loading={busy === "updates"} onClick={() => void runAction("updates", runUpdate)} variant="outline">
                  <RefreshCw size={14} />
                  {busy === "updates" ? "Checking..." : copy.checkUpdates}
                </Button>
                <Button loading={busy === "stop-app"} onClick={() => void runAction("stop-app", stopSlackClawApp)} variant="outline">
                  {busy === "stop-app" ? "Stopping..." : copy.stopApp}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="panel-stack">
                <strong>Danger Zone</strong>
                <p className="card__description">These actions are real daemon-backed controls, not mock buttons.</p>
                <Button loading={busy === "uninstall-app"} onClick={() => void runAction("uninstall-app", uninstallSlackClawApp)} variant="danger">
                  <Trash2 size={14} />
                  {busy === "uninstall-app" ? "Uninstalling..." : copy.uninstallApp}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
