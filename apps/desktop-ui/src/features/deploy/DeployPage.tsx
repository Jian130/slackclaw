import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeploymentTargetId, DeploymentTargetStatus, DeploymentTargetsResponse, ProductOverview, ChillClawDeployPhase, ChillClawEvent } from "@chillclaw/contracts";
import {
  AlertCircle,
  CheckCircle2,
  Container,
  Loader2,
  RefreshCw,
  Rocket,
  Trash2,
  Zap
} from "lucide-react";

import { fetchDeploymentTargets, installDeploymentTarget, restartGateway, uninstallDeploymentTarget, updateDeploymentTarget } from "../../shared/api/client.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { subscribeToDaemonEvents } from "../../shared/api/events.js";
import { settleAfterMutation } from "../../shared/data/settle.js";
import { t } from "../../shared/i18n/messages.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/Card.js";
import { TagBadge } from "../../shared/ui/Badge.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";
import { InfoBanner } from "../../shared/ui/InfoBanner.js";
import { Progress } from "../../shared/ui/Progress.js";
import { OperationsScaffold } from "../../shared/ui/Scaffold.js";
import { StatusBadge } from "../../shared/ui/StatusBadge.js";

type VariantMeta = {
  icon: string;
  gradientClass: string;
  hoverBorderClass: string;
  iconClass: string;
  features: string[];
};

type DeployTargetCard = DeploymentTargetStatus & VariantMeta;

type ActivityStepState = "pending" | "running" | "done";

type ActivityState = {
  title: string;
  summary: string;
  progress: number;
  steps: Array<{
    label: string;
    state: ActivityStepState;
  }>;
  status: "idle" | "running" | "completed" | "failed";
};

type DeployActivityLabels = {
  installTitle: string;
  installSteps: string[];
  updateTitle: string;
  updateSteps: string[];
  uninstallTitle: string;
  uninstallSteps: string[];
  restartTitle: string;
  restartSteps: string[];
};

const variantMeta: Record<DeploymentTargetId, VariantMeta> = {
  standard: {
    icon: "🦞",
    gradientClass: "deploy-variant--standard",
    hoverBorderClass: "deploy-variant--blue",
    iconClass: "deploy-variant__icon--blue",
    features: [
      "Reuses compatible OpenClaw installs",
      "Keeps existing OpenClaw settings",
      "Fastest path to first deploy",
      "Uses the real ChillClaw setup flow"
    ]
  },
  "managed-local": {
    icon: "🦞",
    gradientClass: "deploy-variant--green",
    hoverBorderClass: "deploy-variant--green-hover",
    iconClass: "deploy-variant__icon--green",
    features: [
      "Keeps engine files inside ChillClaw data",
      "Cleaner isolation for desktop installs",
      "Pinned ChillClaw-managed version",
      "Uses the real ChillClaw setup flow"
    ]
  },
  zeroclaw: {
    icon: "🦞",
    gradientClass: "deploy-variant--purple",
    hoverBorderClass: "deploy-variant--purple-hover",
    iconClass: "deploy-variant__icon--purple",
    features: [
      "Reserved future engine slot",
      "Planned adapter-backed install path",
      "Same onboarding and config UX",
      "Not available in v0.1"
    ]
  },
  ironclaw: {
    icon: "🦞",
    gradientClass: "deploy-variant--orange",
    hoverBorderClass: "deploy-variant--orange-hover",
    iconClass: "deploy-variant__icon--orange",
    features: [
      "Reserved future engine slot",
      "Adapter-ready product architecture",
      "Same deploy and config surfaces",
      "Not available in v0.1"
    ]
  }
};

function formatCheckedAt(checkedAt: string | undefined) {
  if (!checkedAt) {
    return undefined;
  }

  const parsed = new Date(checkedAt);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toLocaleString();
}

export function decorateTargets(targets: DeploymentTargetStatus[]): DeployTargetCard[] {
  return targets.map((target) => ({
    ...target,
    ...variantMeta[target.id]
  }));
}

export function getTargetActionKinds(target: DeploymentTargetStatus): Array<"install" | "update" | "uninstall"> {
  if (target.planned || !target.installable) {
    return [];
  }

  if (!target.installed) {
    return ["install"];
  }

  if (target.id === "standard" || target.id === "managed-local") {
    return ["update", "uninstall"];
  }

  return ["uninstall"];
}

export function createActivityState(
  title: string,
  stepLabels: string[],
  currentIndex: number,
  summary: string,
  status: ActivityState["status"]
): ActivityState {
  const normalizedIndex = Math.min(Math.max(currentIndex, 0), Math.max(stepLabels.length - 1, 0));

  return {
    title,
    summary,
    progress:
      status === "idle"
        ? 0
        : status === "completed"
          ? 100
          : Math.round(((normalizedIndex + 1) / stepLabels.length) * 100),
    steps: stepLabels.map((label, index) => ({
      label,
      state:
        status === "idle"
          ? "pending"
          : status === "completed"
            ? "done"
            : status === "failed"
              ? index < normalizedIndex
                ? "done"
                : index === normalizedIndex
                  ? "running"
                  : "pending"
              : index < normalizedIndex
                ? "done"
                : index === normalizedIndex
                  ? "running"
                  : "pending"
    })),
    status
  };
}

function activityTemplateForPhase(
  phase: ChillClawDeployPhase,
  labels: DeployActivityLabels
): { title: string; steps: string[]; stepIndex: number } | undefined {
  switch (phase) {
    case "detecting":
      return { title: labels.installTitle, steps: labels.installSteps, stepIndex: 0 };
    case "reusing":
      return { title: labels.installTitle, steps: labels.installSteps, stepIndex: 1 };
    case "installing":
      return { title: labels.installTitle, steps: labels.installSteps, stepIndex: 2 };
    case "verifying":
      return { title: labels.installTitle, steps: labels.installSteps, stepIndex: labels.installSteps.length - 1 };
    case "updating":
      return { title: labels.updateTitle, steps: labels.updateSteps, stepIndex: 1 };
    case "uninstalling":
      return { title: labels.uninstallTitle, steps: labels.uninstallSteps, stepIndex: 1 };
    case "restarting-gateway":
      return { title: labels.restartTitle, steps: labels.restartSteps, stepIndex: 1 };
    default:
      return undefined;
  }
}

export function shouldRefreshDeploymentTargetsForEvent(event: ChillClawEvent): boolean {
  return event.type === "deploy.completed" || event.type === "gateway.status";
}

export function applyDeployEventToActivity(
  currentActivity: ActivityState | null,
  event: ChillClawEvent,
  labels: DeployActivityLabels
): ActivityState | null {
  if (event.type === "deploy.progress") {
    const template = activityTemplateForPhase(event.phase, labels);

    if (!template) {
      return currentActivity;
    }

    return createActivityState(template.title, template.steps, template.stepIndex, event.message, "running");
  }

  if (event.type === "deploy.completed") {
    if (!currentActivity) {
      return null;
    }

    return createActivityState(
      currentActivity.title,
      currentActivity.steps.map((step) => step.label),
      currentActivity.steps.length - 1,
      event.message,
      event.status === "completed" ? "completed" : "failed"
    );
  }

  if (event.type === "gateway.status" && currentActivity?.title === labels.restartTitle && event.reachable) {
    return createActivityState(
      currentActivity.title,
      currentActivity.steps.map((step) => step.label),
      currentActivity.steps.length - 1,
      event.summary,
      "completed"
    );
  }

  return currentActivity;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type DeploymentSettledState = {
  targets: DeploymentTargetsResponse;
  overview?: ProductOverview;
};

export async function waitForTargetInstalledState(
  fetcher: (options?: { fresh?: boolean }) => Promise<DeploymentTargetsResponse>,
  targetId: "standard" | "managed-local",
  installed: boolean,
  options?: { attempts?: number; delayMs?: number; onUpdate?: (result: DeploymentTargetsResponse) => void }
): Promise<DeploymentTargetsResponse> {
  const attempts = Math.max(options?.attempts ?? 12, 1);
  const delayMs = Math.max(options?.delayMs ?? 750, 0);
  let latest: DeploymentTargetsResponse | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await fetcher({ fresh: true });
    options?.onUpdate?.(latest);

    if (latest.targets.some((target) => target.id === targetId && target.installed === installed)) {
      return latest;
    }

    if (attempt < attempts - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return latest ?? fetcher({ fresh: true });
}

export function waitForInstalledTarget(
  fetcher: (options?: { fresh?: boolean }) => Promise<DeploymentTargetsResponse>,
  targetId: "standard" | "managed-local",
  options?: { attempts?: number; delayMs?: number; onUpdate?: (result: DeploymentTargetsResponse) => void }
) {
  return waitForTargetInstalledState(fetcher, targetId, true, options);
}

export default function DeployPage() {
  const { locale } = useLocale();
  const copy = t(locale).deploy;
  const common = t(locale).common;
  const { refresh } = useOverview();
  const installStepLabels = useMemo(
    () => [copy.installStepDetect, copy.installStepPrepare, copy.installStepConfigure, copy.installStepVerify],
    [copy]
  );
  const updateStepLabels = useMemo(
    () => [
      copy.updateStepInspect,
      copy.updateStepRequest,
      copy.updateStepReload,
      copy.updateStepRestart,
      copy.updateStepHealth,
      copy.updateStepVerify
    ],
    [copy]
  );
  const restartStepLabels = useMemo(
    () => [copy.restartStepCommand, copy.restartStepWait, copy.restartStepVerify],
    [copy]
  );
  const uninstallStepLabels = useMemo(
    () => [copy.uninstallStepStop, copy.uninstallStepRemove, copy.uninstallStepVerify],
    [copy]
  );
  const [installingTargetId, setInstallingTargetId] = useState<"standard" | "managed-local" | "">("");
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [updatingTargetId, setUpdatingTargetId] = useState<"standard" | "managed-local" | "">("");
  const [uninstallingTargetId, setUninstallingTargetId] = useState<"standard" | "managed-local" | "">("");
  const [restartingGateway, setRestartingGateway] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState("");
  const [checkedAt, setCheckedAt] = useState<string>();
  const [targets, setTargets] = useState<DeploymentTargetStatus[]>([]);
  const activityRef = useRef<ActivityState | null>(null);
  const deployActivityLabels = useMemo<DeployActivityLabels>(
    () => ({
      installTitle: copy.progressInstallTitle,
      installSteps: installStepLabels,
      updateTitle: copy.progressUpdateTitle,
      updateSteps: updateStepLabels,
      uninstallTitle: copy.progressUninstallTitle,
      uninstallSteps: uninstallStepLabels,
      restartTitle: copy.progressRestartTitle,
      restartSteps: restartStepLabels
    }),
    [copy, installStepLabels, restartStepLabels, uninstallStepLabels, updateStepLabels]
  );

  function applyTargetsResult(result: DeploymentTargetsResponse) {
    setTargets(result.targets);
    setCheckedAt(result.checkedAt);
  }

  const loadTargets = useCallback(async (options?: { fresh?: boolean }) => {
    setTargetsLoading(true);
    setTargetsError("");

    try {
      const result = await fetchDeploymentTargets(options);
      applyTargetsResult(result);
    } catch (error) {
      setTargetsError(error instanceof Error ? error.message : "ChillClaw could not load deployment targets.");
    } finally {
      setTargetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  const deployTargets = useMemo(() => decorateTargets(targets), [targets]);
  const installedTargets = useMemo(() => deployTargets.filter((target) => target.installed), [deployTargets]);
  const availableTargets = useMemo(
    () => deployTargets.filter((target) => !target.installed && target.installable && !target.planned),
    [deployTargets]
  );
  const plannedTargets = useMemo(() => deployTargets.filter((target) => target.planned), [deployTargets]);
  const actionBusy = Boolean(installingTargetId) || Boolean(updatingTargetId) || Boolean(uninstallingTargetId) || restartingGateway;

  useEffect(() => {
    return subscribeToDaemonEvents((event) => {
      if (!actionBusy) {
        const nextActivity = applyDeployEventToActivity(activityRef.current, event, deployActivityLabels);
        if (nextActivity !== activityRef.current) {
          setActivity(nextActivity);
        }
      }

      if (shouldRefreshDeploymentTargetsForEvent(event)) {
        void loadTargets({ fresh: true });
      }
    });
  }, [actionBusy, deployActivityLabels, loadTargets]);

  function startActivity(title: string, stepLabels: string[]) {
    let stepIndex = 0;
    setActivity(createActivityState(title, stepLabels, stepIndex, stepLabels[0], "running"));

    const timer = setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, stepLabels.length - 1);
      setActivity(createActivityState(title, stepLabels, stepIndex, stepLabels[stepIndex], "running"));
    }, 1200);

    return {
      complete(summary: string) {
        clearInterval(timer);
        setActivity(createActivityState(title, stepLabels, stepLabels.length - 1, summary, "completed"));
      },
      fail(summary: string) {
        clearInterval(timer);
        setActivity(createActivityState(title, stepLabels, stepIndex, summary, "failed"));
      }
    };
  }

  async function settleDeploymentAction<TMutation>(options: {
    mutate: () => Promise<TMutation>;
    getProvisionalState?: (mutation: TMutation) => DeploymentTargetsResponse | undefined;
    isSettled: (state: DeploymentSettledState, mutation: TMutation) => boolean;
  }) {
    return settleAfterMutation<TMutation, DeploymentSettledState>({
      mutate: options.mutate,
      getProvisionalState: (mutation) => {
        const provisionalTargets = options.getProvisionalState?.(mutation);
        if (!provisionalTargets) {
          return undefined;
        }

        return {
          targets: provisionalTargets
        };
      },
      applyState: (state) => {
        applyTargetsResult(state.targets);
      },
      readFresh: async () => {
        const [targetsResult, overviewResult] = await Promise.all([
          fetchDeploymentTargets({ fresh: true }),
          refresh({ fresh: true })
        ]);

        return {
          targets: targetsResult,
          overview: overviewResult
        };
      },
      isSettled: options.isSettled,
      attempts: 12,
      delayMs: 750
    });
  }

  async function handleInstallTarget(targetId: "standard" | "managed-local") {
    setInstallingTargetId(targetId);
    const activityRun = startActivity(copy.progressInstallTitle, installStepLabels);

    try {
      const result = await settleDeploymentAction({
        mutate: () => installDeploymentTarget(targetId),
        isSettled: (state) => state.targets.targets.some((target) => target.id === targetId && target.installed)
      });
      activityRun.complete(result.mutation.message);
    } catch (error) {
      activityRun.fail(error instanceof Error ? error.message : copy.progressFailed);
    } finally {
      setInstallingTargetId("");
    }
  }

  async function handleUpdateTarget(targetId: "standard" | "managed-local") {
    setUpdatingTargetId(targetId);
    const activityRun = startActivity(copy.progressUpdateTitle, updateStepLabels);

    try {
      const result = await settleDeploymentAction({
        mutate: () => updateDeploymentTarget(targetId),
        isSettled: (state, mutation) => {
          const target = state.targets.targets.find((item) => item.id === targetId);

          if (!target?.installed) {
            return false;
          }

          if (mutation.status !== "completed") {
            return true;
          }

          if (mutation.engineStatus.version && target.version !== mutation.engineStatus.version) {
            return false;
          }

          return !target.updateAvailable;
        }
      });
      activityRun.complete(result.mutation.message);
    } catch (error) {
      activityRun.fail(error instanceof Error ? error.message : copy.progressFailed);
    } finally {
      setUpdatingTargetId("");
    }
  }

  async function handleUninstallTarget(targetId: "standard" | "managed-local") {
    setUninstallingTargetId(targetId);
    const activityRun = startActivity(copy.progressUninstallTitle, uninstallStepLabels);

    try {
      const result = await settleDeploymentAction({
        mutate: () => uninstallDeploymentTarget(targetId),
        isSettled: (state) => state.targets.targets.some((target) => target.id === targetId && !target.installed)
      });
      const summary = result.mutation.message;
      if (result.mutation.status === "completed") {
        activityRun.complete(summary);
      } else {
        activityRun.fail(summary);
      }
    } catch (error) {
      activityRun.fail(error instanceof Error ? error.message : copy.progressFailed);
    } finally {
      setUninstallingTargetId("");
    }
  }

  async function handleRestartGateway() {
    setRestartingGateway(true);
    const activityRun = startActivity(copy.progressRestartTitle, restartStepLabels);

    try {
      const result = await settleDeploymentAction({
        mutate: () => restartGateway(),
        isSettled: (state, mutation) => {
          if (mutation.status !== "completed") {
            return true;
          }

          const engine = state.overview?.engine;
          return Boolean(engine?.installed && engine.running);
        }
      });
      if (result.mutation.status === "completed") {
        activityRun.complete(result.mutation.message);
      } else {
        activityRun.fail(result.mutation.message);
      }
    } catch (error) {
      activityRun.fail(error instanceof Error ? error.message : copy.progressFailed);
    } finally {
      setRestartingGateway(false);
    }
  }

  function renderTargetCard(target: DeployTargetCard) {
    const updatableTargetId =
      target.id === "standard" || target.id === "managed-local" ? target.id : undefined;
    const actionableTargetId =
      target.id === "standard" || target.id === "managed-local" ? target.id : undefined;
    const latestVersionDisplay =
      target.latestVersion ?? (!target.updateAvailable && target.version ? target.version : "n/a");
    const actionKinds = getTargetActionKinds(target);

    return (
      <Card
        className={[
          "deploy-variant-card",
          target.gradientClass,
          target.planned ? "deploy-variant-card--planned" : "",
          "deploy-variant-card--static"
        ]
          .filter(Boolean)
          .join(" ")}
        key={target.id}
      >
        <CardHeader>
          <div className="deploy-variant-card__header">
            <div className="deploy-variant-card__identity">
              <div className={`deploy-variant__icon ${target.iconClass}`}>
                <span>{target.icon}</span>
              </div>
              <div>
                <CardTitle>{target.title}</CardTitle>
                <CardDescription className="deploy-variant-card__description">
                  {target.description}
                </CardDescription>
              </div>
            </div>
            <div className="deploy-variant-card__badges">
              {target.installed ? (
                <StatusBadge className="deploy-badge deploy-badge--installed" tone="success">
                  {copy.installedBadge}
                </StatusBadge>
              ) : null}
              {target.active ? (
                <StatusBadge className="deploy-badge deploy-badge--current" tone="info">
                  {copy.currentBadge}
                </StatusBadge>
              ) : null}
              {target.updateAvailable ? (
                <StatusBadge className="deploy-badge deploy-badge--update" tone="warning">
                  {copy.updateBadge}
                </StatusBadge>
              ) : null}
              {target.recommended && !target.installed ? (
                <TagBadge className="deploy-badge deploy-badge--recommended" tone="success">{copy.recommendedBadge}</TagBadge>
              ) : null}
              {target.planned ? (
                <TagBadge className="deploy-badge deploy-badge--planned" tone="neutral">{common.comingSoon}</TagBadge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="deploy-variant-card__body">
            <p className="deploy-target-summary">{target.summary}</p>
            <div
              className={[
                "deploy-target-version-grid",
                target.installed && updatableTargetId ? "deploy-target-version-grid--with-action" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div>
                <p>{copy.versionLabel}</p>
                <strong>{target.version ?? copy.notInstalledLabel}</strong>
              </div>
              <div>
                <p>{copy.latestVersionLabel}</p>
                <strong>{latestVersionDisplay}</strong>
              </div>
            </div>
            {target.updateSummary ? <p className="deploy-target-update">{target.updateSummary}</p> : null}
            {actionKinds.length ? (
              <div className="deploy-target-actions">
                {actionKinds.includes("install") && actionableTargetId ? (
                  <Button
                    disabled={actionBusy}
                    onClick={() => void handleInstallTarget(actionableTargetId)}
                    size="sm"
                  >
                    {installingTargetId === actionableTargetId ? (
                      <>
                        <Loader2 className="deploy-cta-button__spinner" size={16} />
                        {copy.deploying}
                      </>
                    ) : (
                      <>
                        <Rocket size={16} />
                        {copy.installButton}
                      </>
                    )}
                  </Button>
                ) : null}
                {actionKinds.includes("update") && updatableTargetId ? (
                  <Button
                    disabled={actionBusy || !target.updateAvailable}
                    onClick={() => void handleUpdateTarget(updatableTargetId)}
                    size="sm"
                    variant="outline"
                  >
                    {updatingTargetId === updatableTargetId ? (
                      <>
                        <Loader2 className="deploy-cta-button__spinner" size={16} />
                        {copy.updatingLabel}
                      </>
                    ) : (
                      <>
                        <RefreshCw size={16} />
                        {target.updateAvailable ? copy.updateButton : copy.upToDateButton}
                      </>
                    )}
                  </Button>
                ) : null}
                {actionKinds.includes("uninstall") && actionableTargetId ? (
                  <Button
                    disabled={actionBusy}
                    onClick={() => void handleUninstallTarget(actionableTargetId)}
                    size="sm"
                    variant="outline"
                  >
                    {uninstallingTargetId === actionableTargetId ? (
                      <>
                        <Loader2 className="deploy-cta-button__spinner" size={16} />
                        {copy.uninstallingLabel}
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        {copy.uninstallButton}
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div>
              <h4>{copy.featuresTitle}</h4>
              <ul className="deploy-feature-list">
                {target.features.map((feature) => (
                  <li key={feature}>
                    <CheckCircle2 size={16} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="deploy-requirements">
              <h4>{copy.requirementsTitle}</h4>
              {target.requirements && target.requirements.length > 0 ? (
                <ul className="deploy-requirements__list">
                  {target.requirements.map((requirement) => (
                    <li key={requirement}>
                      <CheckCircle2 size={16} />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="deploy-requirements__empty">{copy.requirementsUnavailable}</p>
              )}
              {target.requirementsSourceUrl ? (
                <p className="deploy-requirements__source">
                  <a href={target.requirementsSourceUrl} rel="noreferrer" target="_blank">
                    {copy.requirementsSourceLabel}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <OperationsScaffold
      className="deploy-page"
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <>
          <Button disabled={actionBusy} onClick={() => void loadTargets({ fresh: true })} size="sm" variant="outline">
            <RefreshCw size={16} />
            {targetsLoading ? copy.detectingTargets : common.refresh}
          </Button>
          <Button
            disabled={actionBusy || installedTargets.length === 0}
            onClick={() => void handleRestartGateway()}
            size="sm"
            variant="outline"
          >
            {restartingGateway ? (
              <>
                <Loader2 className="deploy-cta-button__spinner" size={16} />
                {copy.restartingGatewayLabel}
              </>
            ) : (
              <>
                <Zap size={16} />
                {copy.restartGatewayButton}
              </>
            )}
          </Button>
        </>
      }
      activity={
        activity ? (
          <Card
            className={[
              "deploy-progress-card",
              activity.status === "failed" ? "deploy-progress-card--failed" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <CardContent className="deploy-progress-card__content">
              <div className="deploy-progress-card__row">
                {activity.status === "running" ? (
                  <Loader2 className="deploy-progress-card__spinner" size={24} />
                ) : (
                  <Rocket className="deploy-progress-card__icon" size={24} />
                )}
                <div className="deploy-progress-card__meta">
                  <h3>{activity.title}</h3>
                  <p>{activity.summary}</p>
                </div>
                <span className="deploy-progress-card__value">{activity.progress}%</span>
              </div>
              <Progress value={activity.progress} />
              <div className="deploy-progress-steps">
                {activity.steps.map((step) => (
                  <div className="deploy-progress-step" key={step.label}>
                    <span
                      className={[
                        "deploy-progress-step__indicator",
                        `deploy-progress-step__indicator--${step.state}`
                      ].join(" ")}
                    />
                    <span className="deploy-progress-step__label">{step.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null
      }
      hero={
        <InfoBanner icon={<Rocket size={24} />} title={copy.infoTitle} description={copy.infoBody} accent="blue">
          <div className="deploy-info-card__checks">
            <div>
              <CheckCircle2 size={16} />
              <span>{copy.detectInstalled}</span>
            </div>
            <div>
              <CheckCircle2 size={16} />
              <span>{copy.showVersions}</span>
            </div>
            <div>
              <CheckCircle2 size={16} />
              <span>{copy.checkUpdates}</span>
            </div>
          </div>
          {checkedAt ? <p>{copy.lastChecked.replace("{time}", formatCheckedAt(checkedAt) ?? checkedAt)}</p> : null}
        </InfoBanner>
      }
    >

      {targetsError ? (
        <Card className="deploy-section-card">
          <CardContent className="deploy-section-card__content">
            <EmptyState
              title={copy.targetsErrorTitle}
              description={targetsError}
              actionLabel={common.retry}
              onAction={() => void loadTargets({ fresh: true })}
            />
          </CardContent>
        </Card>
      ) : null}

      {!targetsError ? (
        <>
          <Card className="deploy-section-card">
            <CardHeader className="deploy-section-card__header">
              <div>
                <CardTitle>{copy.installedGroupTitle}</CardTitle>
                <CardDescription>{copy.installedGroupBody}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="deploy-section-card__content">
              {targetsLoading ? (
                <div className="deploy-state-row">
                  <Loader2 className="deploy-inline-spinner" size={18} />
                  <span>{copy.detectingTargets}</span>
                </div>
              ) : installedTargets.length ? (
                <div className="deploy-variant-grid">
                  {installedTargets.map((target) => renderTargetCard(target))}
                </div>
              ) : (
                <EmptyState
                  title={copy.installedEmptyTitle}
                  description={copy.installedEmptyBody}
                />
              )}
            </CardContent>
          </Card>

          <Card className="deploy-section-card">
            <CardHeader className="deploy-section-card__header">
              <div>
                <CardTitle>{copy.availableGroupTitle}</CardTitle>
                <CardDescription>{copy.availableGroupBody}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="deploy-section-card__content">
              {targetsLoading ? (
                <div className="deploy-state-row">
                  <Loader2 className="deploy-inline-spinner" size={18} />
                  <span>{copy.detectingTargets}</span>
                </div>
              ) : availableTargets.length ? (
                <div className="deploy-variant-grid">
                  {availableTargets.map((target) => renderTargetCard(target))}
                </div>
              ) : (
                <EmptyState
                  title={copy.availableEmptyTitle}
                  description={copy.availableEmptyBody}
                />
              )}
            </CardContent>
          </Card>

          {plannedTargets.length ? (
            <Card className="deploy-section-card">
              <CardHeader className="deploy-section-card__header">
                <div>
                  <CardTitle>{copy.plannedGroupTitle}</CardTitle>
                  <CardDescription>{copy.plannedGroupBody}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="deploy-section-card__content">
                <div className="deploy-variant-grid">
                  {plannedTargets.map((target) => renderTargetCard(target))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <div className="deploy-summary-grid">
        <Card>
          <CardContent className="deploy-summary-card">
            <Container className="deploy-summary-card__icon deploy-summary-card__icon--blue" size={20} />
            <div>
              <h4>{copy.summaryLocalTitle}</h4>
              <p>{copy.summaryLocalBody}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="deploy-summary-card">
            <Zap className="deploy-summary-card__icon deploy-summary-card__icon--green" size={20} />
            <div>
              <h4>{copy.summaryFastTitle}</h4>
              <p>{copy.summaryFastBody}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="deploy-summary-card">
            <AlertCircle className="deploy-summary-card__icon deploy-summary-card__icon--purple" size={20} />
            <div>
              <h4>{copy.summarySafeTitle}</h4>
              <p>{copy.summarySafeBody}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </OperationsScaffold>
  );
}
