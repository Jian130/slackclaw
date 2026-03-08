import { useEffect, useState } from "react";

import type {
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  ProductOverview,
  RecoveryAction,
  TaskTemplate
} from "@slackclaw/contracts";

import {
  completeOnboarding,
  exportDiagnostics,
  fetchOverview,
  installAppService,
  installSlackClaw,
  restartAppService,
  runRecovery,
  runTask,
  runUpdate,
  uninstallAppService
} from "./api.js";
import { detectLocale, localeOptions, t, type Locale } from "./i18n.js";

function SectionHeader(props: { eyebrow: string; title: string; detail: string }) {
  return (
    <header className="section-header">
      <p className="eyebrow">{props.eyebrow}</p>
      <h2>{props.title}</h2>
      <p className="detail">{props.detail}</p>
    </header>
  );
}

function summarizeInstallDisposition(locale: Locale, install: InstallResponse): string {
  switch (install.disposition) {
    case "reused-existing":
      return t(locale, "installOutcomeReused");
    case "installed":
      return t(locale, "installOutcomeInstalled");
    case "reinstalled":
      return t(locale, "installOutcomeReinstalled");
    case "onboarded":
      return t(locale, "installOutcomeOnboarded");
    default:
      return install.message;
  }
}

function severityRank(check: HealthCheckResult): number {
  switch (check.severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

export default function App() {
  const [overview, setOverview] = useState<ProductOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("email-admin");
  const [selectedTemplateId, setSelectedTemplateId] = useState("summarize-thread");
  const [prompt, setPrompt] = useState("");
  const [taskResult, setTaskResult] = useState<EngineTaskResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastInstall, setLastInstall] = useState<InstallResponse | null>(null);
  const [locale, setLocale] = useState<Locale>(detectLocale());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("slackclaw.locale") as Locale | null;
    if (stored && localeOptions.some((option) => option.value === stored)) {
      setLocale(stored);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, []);

  function selectLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("slackclaw.locale", nextLocale);
    }
  }

  const selectedTemplate: TaskTemplate | undefined = overview?.templates.find(
    (template) => template.id === selectedTemplateId
  );

  const criticalChecks = (overview?.healthChecks ?? [])
    .filter((check) => check.severity === "error" || check.severity === "warning")
    .sort((left, right) => severityRank(right) - severityRank(left));

  const recommendedRecoveryActions = (overview?.recoveryActions ?? []).filter((action) =>
    criticalChecks.some((check) => check.remediationActionIds.includes(action.id))
  );

  const prioritizedRecoveryActions: RecoveryAction[] =
    recommendedRecoveryActions.length > 0
      ? [
          ...recommendedRecoveryActions,
          ...(overview?.recoveryActions ?? []).filter(
            (action) => !recommendedRecoveryActions.some((candidate) => candidate.id === action.id)
          )
        ]
      : (overview?.recoveryActions ?? []);

  async function loadOverview() {
    try {
      setError(null);
      const nextOverview = await fetchOverview();
      setOverview(nextOverview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t(locale, "loadFailed"));
    }
  }

  async function handleInstall() {
    setBusy("install");
    setNotice(null);
    setError(null);
    try {
      const result = await installSlackClaw(true);
      setOverview(result.overview);
      setLastInstall(result.install);
      setNotice(summarizeInstallDisposition(locale, result.install));
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : t(locale, "installFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleOnboarding() {
    setBusy("onboarding");
    setNotice(null);
    setError(null);
    try {
      const nextOverview = await completeOnboarding({ profileId: selectedProfileId });
      setOverview(nextOverview);
      setNotice(t(locale, "onboardingReady"));
    } catch (onboardingError) {
      setError(onboardingError instanceof Error ? onboardingError.message : t(locale, "onboardingFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleRunTask() {
    if (!prompt.trim()) {
      setError(t(locale, "enterPrompt"));
      return;
    }

    setBusy("task");
    setError(null);
    setNotice(null);

    try {
      const result = await runTask({
        profileId: selectedProfileId,
        templateId: selectedTemplateId,
        prompt
      });
      setTaskResult(result);
      await loadOverview();
      setNotice(result.status === "completed" ? t(locale, "taskCompleted") : t(locale, "taskFailedNotice"));
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : t(locale, "taskFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleRecovery(actionId: string) {
    setBusy(actionId);
    setNotice(null);
    setError(null);
    try {
      const result = await runRecovery(actionId);
      setOverview(result.overview);
      setNotice(result.result.message);
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : t(locale, "recoveryFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate() {
    setBusy("update");
    setError(null);
    try {
      const result = await runUpdate();
      setNotice(result.message);
      await loadOverview();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t(locale, "updateFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleExportDiagnostics() {
    setBusy("diagnostics");
    setError(null);
    try {
      const result = await exportDiagnostics();
      setNotice(`${result.message} ${result.path}`);
    } catch (diagnosticsError) {
      setError(diagnosticsError instanceof Error ? diagnosticsError.message : t(locale, "exportFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleServiceAction(action: "install" | "restart" | "uninstall") {
    setBusy(`service-${action}`);
    setError(null);
    setNotice(null);

    try {
      const result =
        action === "install"
          ? await installAppService()
          : action === "restart"
            ? await restartAppService()
            : await uninstallAppService();

      setOverview(result.overview);
      setNotice(result.result.message);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : t(locale, "recoveryFailed"));
    } finally {
      setBusy(null);
    }
  }

  const heroStatusLabel = !overview
    ? t(locale, "connecting")
    : overview.engine.installed
      ? overview.engine.running
        ? t(locale, "engineReady")
        : t(locale, "needsAttention")
      : t(locale, "installRequired");

  return (
    <div className="shell">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t(locale, "appEyebrow")}</p>
          <h1>{t(locale, "heroTitle")}</h1>
          <p className="detail">{t(locale, "heroDetail")}</p>
          <div className="action-row">
            <button className="ghost" onClick={() => void loadOverview()} disabled={busy !== null}>
              {t(locale, "refreshStatus")}
            </button>
            <label className="locale-picker">
              <span>{t(locale, "language")}</span>
              <select value={locale} onChange={(event) => selectLocale(event.target.value as Locale)}>
                {localeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="hero-status">
          <span className={`status-pill ${overview?.engine.running ? "ok" : "warning"}`}>
            {heroStatusLabel}
          </span>
          <p>{overview?.engine.summary ?? "Connecting to local SlackClaw daemon..."}</p>
          <p className="micro">{t(locale, "platformTarget", { value: overview?.platformTarget ?? "macOS first" })}</p>
          {criticalChecks[0] ? (
            <div className="hero-alert">
              <strong>{t(locale, "immediateBlocker")}</strong>
              <p>{criticalChecks[0].summary}</p>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}
      {notice ? <div className="banner ok">{notice}</div> : null}

      <main className="grid">
        <section className="panel install-panel">
          <SectionHeader
            eyebrow={t(locale, "installEyebrow")}
            title={t(locale, "installTitle")}
            detail={t(locale, "installDetail")}
          />
          <ul className="check-list">
            {overview?.installChecks.map((check) => (
              <li key={check.id}>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </li>
            ))}
          </ul>

          <div className="install-summary">
            <div className="install-kv">
              <span>{t(locale, "pinnedOpenClaw")}</span>
              <strong>{overview?.installSpec.desiredVersion ?? "2026.3.7"}</strong>
            </div>
            <div className="install-kv">
              <span>{t(locale, "detectedVersion")}</span>
              <strong>{overview?.engine.version ?? "Not detected"}</strong>
            </div>
            <div className="install-kv">
              <span>{t(locale, "installSource")}</span>
              <strong>{overview?.installSpec.installSource ?? "npm-global"}</strong>
            </div>
          </div>

          {lastInstall ? (
            <article className="install-outcome">
              <strong>{summarizeInstallDisposition(locale, lastInstall)}</strong>
              <p>{lastInstall.message}</p>
              <span className="micro">
                {t(locale, "installOutcomeExisting", {
                  value: lastInstall.hadExisting ? lastInstall.existingVersion ?? "detected" : "none"
                })}{" "}
                |{" "}
                {t(locale, "installOutcomeActive", {
                  value: lastInstall.actualVersion ?? lastInstall.engineStatus.version ?? "unknown"
                })}
              </span>
            </article>
          ) : null}

          <button className="primary" onClick={handleInstall} disabled={busy !== null}>
            {busy === "install" ? t(locale, "installing") : t(locale, "installAndConfigure")}
          </button>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow={t(locale, "serviceEyebrow")}
            title={t(locale, "serviceTitle")}
            detail={t(locale, "serviceDetail")}
          />
          <div className="install-summary">
            <div className="install-kv">
              <span>{t(locale, "serviceMode")}</span>
              <strong>{overview?.appService.mode ?? "unmanaged"}</strong>
            </div>
            <div className="install-kv">
              <span>{t(locale, "serviceInstalled")}</span>
              <strong>{overview?.appService.installed ? t(locale, "yes") : t(locale, "no")}</strong>
            </div>
            <div className="install-kv">
              <span>{t(locale, "serviceManagedAtLogin")}</span>
              <strong>{overview?.appService.managedAtLogin ? t(locale, "yes") : t(locale, "no")}</strong>
            </div>
          </div>
          <article className="install-outcome">
            <strong>{overview?.appService.summary ?? "SlackClaw service status unavailable."}</strong>
            <p>{overview?.appService.detail ?? ""}</p>
          </article>
          <div className="action-row">
            <button className="secondary" onClick={() => void handleServiceAction("install")} disabled={busy !== null}>
              {t(locale, "serviceInstall")}
            </button>
            <button className="ghost" onClick={() => void handleServiceAction("restart")} disabled={busy !== null}>
              {t(locale, "serviceRestart")}
            </button>
            <button className="ghost" onClick={() => void handleServiceAction("uninstall")} disabled={busy !== null}>
              {t(locale, "serviceUninstall")}
            </button>
          </div>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow={t(locale, "onboardingEyebrow")}
            title={t(locale, "onboardingTitle")}
            detail={t(locale, "onboardingDetail")}
          />
          <div className="profile-grid">
            {overview?.profiles.map((profile) => (
              <button
                key={profile.id}
                className={`profile-card ${selectedProfileId === profile.id ? "selected" : ""}`}
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <strong>{profile.name}</strong>
                <span>{profile.description}</span>
              </button>
            ))}
          </div>
          <button className="secondary" onClick={handleOnboarding} disabled={busy !== null}>
            {busy === "onboarding" ? t(locale, "savingDefaults") : t(locale, "completeOnboarding")}
          </button>
        </section>

        <section className="panel workspace-panel">
          <SectionHeader
            eyebrow={t(locale, "firstTaskEyebrow")}
            title={t(locale, "firstTaskTitle")}
            detail={t(locale, "firstTaskDetail")}
          />
          <div className="task-grid">
            <div className="template-column">
              {overview?.templates.map((template) => (
                <button
                  key={template.id}
                  className={`template-card ${selectedTemplateId === template.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setPrompt(template.promptHint);
                  }}
                >
                  <strong>{template.title}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
            <div className="composer">
              <label>
                <span>{t(locale, "prompt")}</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={selectedTemplate?.promptHint ?? "Describe the work you want done."}
                />
              </label>
              <button className="primary" onClick={handleRunTask} disabled={busy !== null}>
                {busy === "task" ? t(locale, "runningTask") : t(locale, "runTask")}
              </button>
            </div>
          </div>

          <div className="result-card">
            <h3>{t(locale, "latestResult")}</h3>
            {taskResult ? (
              <>
                <p className="result-summary">{taskResult.summary}</p>
                <pre>{taskResult.output}</pre>
                <div className="chip-row">
                  {taskResult.nextActions.map((action) => (
                    <span key={action} className="chip">
                      {action}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="detail">{t(locale, "noResult")}</p>
            )}
          </div>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow={t(locale, "healthEyebrow")}
            title={t(locale, "healthTitle")}
            detail={t(locale, "healthDetail")}
          />
          {criticalChecks.length > 0 ? (
            <div className="priority-list">
              {criticalChecks.map((check) => (
                <article key={check.id} className={`priority-card ${check.severity}`}>
                  <strong>{check.title}</strong>
                  <p>{check.summary}</p>
                  <span className="micro">{check.detail}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="detail">{t(locale, "noUrgentBlockers")}</p>
          )}

          <div className="health-stack">
            {overview?.healthChecks.map((check) => (
              <article key={check.id} className={`health-card ${check.severity}`}>
                <div>
                  <strong>{check.title}</strong>
                  <p>{check.summary}</p>
                </div>
                <span className="micro">{check.detail}</span>
              </article>
            ))}
          </div>
          <div className="action-row">
            <button className="secondary" onClick={handleUpdate} disabled={busy !== null}>
              {busy === "update" ? t(locale, "checkingUpdates") : t(locale, "checkUpdates")}
            </button>
            <button className="ghost" onClick={handleExportDiagnostics} disabled={busy !== null}>
              {busy === "diagnostics" ? t(locale, "exportingDiagnostics") : t(locale, "exportDiagnostics")}
            </button>
          </div>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow={t(locale, "recoveryEyebrow")}
            title={t(locale, "recoveryTitle")}
            detail={t(locale, "recoveryDetail")}
          />
          <div className="recovery-list">
            {prioritizedRecoveryActions.map((action) => (
              <article key={action.id} className="recovery-card">
                <div>
                  <strong>
                    {action.title}
                    {recommendedRecoveryActions.some((candidate) => candidate.id === action.id)
                      ? ` ${t(locale, "recommended")}`
                      : ""}
                  </strong>
                  <p>{action.description}</p>
                  <span className="micro">{action.expectedImpact}</span>
                </div>
                <button className="ghost" onClick={() => handleRecovery(action.id)} disabled={busy !== null}>
                  {busy === action.id ? "Running..." : "Run"}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow={t(locale, "historyEyebrow")}
            title={t(locale, "historyTitle")}
            detail={t(locale, "historyDetail")}
          />
          <div className="history-list">
            {overview?.recentTasks.length ? (
              overview.recentTasks.map((task) => (
                <article key={task.taskId} className="history-card">
                  <strong>{task.title}</strong>
                  <p>{task.summary}</p>
                  <span className="micro">{new Date(task.startedAt).toLocaleString()}</span>
                </article>
              ))
            ) : (
              <p className="detail">{t(locale, "noHistory")}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
