import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { DeploymentTargetId, DeploymentTargetStatus } from "@slackclaw/contracts";
import {
  AlertCircle,
  CheckCircle2,
  Container,
  Loader2,
  RefreshCw,
  Rocket,
  Zap
} from "lucide-react";

import { fetchDeploymentTargets, runFirstRunSetup, updateDeploymentTarget } from "../../shared/api/client.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { t } from "../../shared/i18n/messages.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/Card.js";
import { Badge } from "../../shared/ui/Badge.js";
import { EmptyState } from "../../shared/ui/EmptyState.js";
import { Progress } from "../../shared/ui/Progress.js";

type VariantMeta = {
  icon: string;
  gradientClass: string;
  hoverBorderClass: string;
  iconClass: string;
  features: string[];
  requirements: {
    memory: string;
    disk: string;
    runtime: string;
  };
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
      "Uses the real SlackClaw setup flow"
    ],
    requirements: {
      memory: "4GB RAM",
      disk: "10GB",
      runtime: "System install"
    }
  },
  "managed-local": {
    icon: "🦞",
    gradientClass: "deploy-variant--green",
    hoverBorderClass: "deploy-variant--green-hover",
    iconClass: "deploy-variant__icon--green",
    features: [
      "Keeps engine files inside SlackClaw data",
      "Cleaner isolation for desktop installs",
      "Pinned SlackClaw-managed version",
      "Uses the real SlackClaw setup flow"
    ],
    requirements: {
      memory: "4GB RAM",
      disk: "10GB",
      runtime: "Managed local"
    }
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
    ],
    requirements: {
      memory: "Planned",
      disk: "Planned",
      runtime: "Coming soon"
    }
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
    ],
    requirements: {
      memory: "Planned",
      disk: "Planned",
      runtime: "Coming soon"
    }
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

function handleCardKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onActivate: () => void,
  disabled: boolean
) {
  if (disabled) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
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

export default function DeployPage() {
  const { locale } = useLocale();
  const copy = t(locale).deploy;
  const common = t(locale).common;
  const { overview, refresh } = useOverview();
  const installStepLabels = useMemo(
    () => [copy.installStepDetect, copy.installStepPrepare, copy.installStepConfigure, copy.installStepVerify],
    [copy]
  );
  const updateStepLabels = useMemo(
    () => [copy.updateStepInspect, copy.updateStepRequest, copy.updateStepSync, copy.updateStepVerify],
    [copy]
  );
  const [selectedVariant, setSelectedVariant] = useState<DeploymentTargetId | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [message, setMessage] = useState("");
  const [updatingTargetId, setUpdatingTargetId] = useState<"standard" | "managed-local" | "">("");
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState("");
  const [checkedAt, setCheckedAt] = useState<string>();
  const [targets, setTargets] = useState<DeploymentTargetStatus[]>([]);

  async function loadTargets() {
    setTargetsLoading(true);
    setTargetsError("");

    try {
      const result = await fetchDeploymentTargets();
      const selectableTarget = result.targets.find((target) => !target.installed && target.installable && !target.planned);

      setTargets(result.targets);
      setCheckedAt(result.checkedAt);
      setSelectedVariant((current) => {
        if (current && result.targets.some((target) => target.id === current && !target.installed && target.installable && !target.planned)) {
          return current;
        }

        return selectableTarget?.id ?? null;
      });
    } catch (error) {
      setTargetsError(error instanceof Error ? error.message : "SlackClaw could not load deployment targets.");
    } finally {
      setTargetsLoading(false);
    }
  }

  useEffect(() => {
    void loadTargets();
  }, []);

  const deployTargets = useMemo(() => decorateTargets(targets), [targets]);
  const installedTargets = useMemo(() => deployTargets.filter((target) => target.installed), [deployTargets]);
  const availableTargets = useMemo(
    () => deployTargets.filter((target) => !target.installed && target.installable && !target.planned),
    [deployTargets]
  );
  const plannedTargets = useMemo(() => deployTargets.filter((target) => target.planned), [deployTargets]);
  const selectedVariantName = useMemo(
    () => deployTargets.find((target) => target.id === selectedVariant)?.title,
    [deployTargets, selectedVariant]
  );
  const actionBusy = deploying || Boolean(updatingTargetId);

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

  async function handleDeploy() {
    if (!selectedVariant || selectedVariant === "zeroclaw" || selectedVariant === "ironclaw") {
      return;
    }

    setDeploying(true);
    setMessage("");
    const activityRun = startActivity(copy.progressInstallTitle, installStepLabels);

    try {
      const result = await runFirstRunSetup(selectedVariant === "managed-local");
      setMessage(result.message);
      activityRun.complete(result.message);
      await Promise.all([refresh(), loadTargets()]);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : copy.progressFailed;
      setMessage(nextMessage);
      activityRun.fail(nextMessage);
    } finally {
      setDeploying(false);
      setActivity(null);
    }
  }

  async function handleUpdateTarget(targetId: "standard" | "managed-local") {
    setUpdatingTargetId(targetId);
    setMessage("");
    const activityRun = startActivity(copy.progressUpdateTitle, updateStepLabels);

    try {
      const result = await updateDeploymentTarget(targetId);
      setMessage(result.message);
      activityRun.complete(result.message);
      await Promise.all([refresh(), loadTargets()]);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : copy.progressFailed;
      setMessage(nextMessage);
      activityRun.fail(nextMessage);
    } finally {
      setUpdatingTargetId("");
      setActivity(null);
    }
  }

  function renderTargetCard(target: DeployTargetCard, selectable: boolean) {
    const selected = selectable && selectedVariant === target.id;
    const updatableTargetId =
      target.id === "standard" || target.id === "managed-local" ? target.id : undefined;
    const latestVersionDisplay =
      target.latestVersion ?? (!target.updateAvailable && target.version ? target.version : "n/a");

    return (
      <Card
        className={[
          "deploy-variant-card",
          target.gradientClass,
          selected ? "deploy-variant-card--selected" : "",
          selectable && !selected ? target.hoverBorderClass : "",
          target.planned ? "deploy-variant-card--planned" : "",
          !selectable ? "deploy-variant-card--static" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        key={target.id}
        onClick={() => {
          if (selectable) {
            setSelectedVariant(target.id);
          }
        }}
        onKeyDown={(event) => handleCardKeyDown(event, () => setSelectedVariant(target.id), !selectable)}
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : -1}
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
                <Badge className="deploy-badge deploy-badge--installed" tone="success">
                  {copy.installedBadge}
                </Badge>
              ) : null}
              {target.active ? (
                <Badge className="deploy-badge deploy-badge--current" tone="info">
                  {copy.currentBadge}
                </Badge>
              ) : null}
              {target.updateAvailable ? (
                <Badge className="deploy-badge deploy-badge--update" tone="warning">
                  {copy.updateBadge}
                </Badge>
              ) : null}
              {target.recommended && !target.installed ? (
                <Badge className="deploy-badge deploy-badge--recommended">{copy.recommendedBadge}</Badge>
              ) : null}
              {target.planned ? (
                <Badge className="deploy-badge deploy-badge--planned">{common.comingSoon}</Badge>
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
              {target.installed && updatableTargetId ? (
                <div className="deploy-target-version-grid__action">
                  <Button
                    disabled={actionBusy || !target.updateAvailable}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleUpdateTarget(updatableTargetId);
                    }}
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
                </div>
              ) : null}
            </div>
            {target.updateSummary ? <p className="deploy-target-update">{target.updateSummary}</p> : null}
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
              <div className="deploy-requirements__grid">
                <div>
                  <p>{copy.memoryLabel}</p>
                  <strong>{target.requirements.memory}</strong>
                </div>
                <div>
                  <p>{copy.diskLabel}</p>
                  <strong>{target.requirements.disk}</strong>
                </div>
                <div>
                  <p>{copy.runtimeLabel}</p>
                  <strong>{target.requirements.runtime}</strong>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="deploy-page">
      <div className="deploy-header">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </div>

      {actionBusy && activity ? (
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
      ) : null}

      <Card className="deploy-info-card">
        <CardContent className="deploy-info-card__content">
          <div className="deploy-info-card__icon">
            <Rocket size={24} />
          </div>
          <div className="deploy-info-card__copy">
            <h3>{copy.infoTitle}</h3>
            <p>{copy.infoBody}</p>
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
          </div>
          <div className="deploy-info-card__actions">
            <Button disabled={actionBusy} onClick={() => void loadTargets()} size="sm" variant="outline">
              <RefreshCw size={16} />
              {targetsLoading ? copy.detectingTargets : common.refresh}
            </Button>
            {checkedAt ? <p>{copy.lastChecked.replace("{time}", formatCheckedAt(checkedAt) ?? checkedAt)}</p> : null}
          </div>
        </CardContent>
      </Card>

      {targetsError ? (
        <Card className="deploy-section-card">
          <CardContent className="deploy-section-card__content">
            <EmptyState
              title={copy.targetsErrorTitle}
              description={targetsError}
              actionLabel={common.retry}
              onAction={() => void loadTargets()}
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
                  {installedTargets.map((target) => renderTargetCard(target, false))}
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
                  {availableTargets.map((target) => renderTargetCard(target, true))}
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
                  {plannedTargets.map((target) => renderTargetCard(target, false))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card className="deploy-cta-card">
        <CardContent className="deploy-cta-card__content">
          <div>
            <h3>{copy.readyTitle}</h3>
            <p>
              {selectedVariantName
                ? copy.selectedTarget.replace("{target}", selectedVariantName)
                : copy.selectTargetPrompt}
            </p>
            {message ? <p className="deploy-cta-card__message">{message}</p> : null}
            {!message && overview?.firstRun.setupCompleted ? (
              <p className="deploy-cta-card__message">{copy.completion}</p>
            ) : null}
          </div>
          <Button
            className="deploy-cta-button"
            disabled={!selectedVariant || actionBusy}
            onClick={handleDeploy}
            size="lg"
          >
            {deploying ? (
              <>
                <Loader2 className="deploy-cta-button__spinner" size={20} />
                {copy.deploying}
              </>
            ) : (
              <>
                <Rocket size={20} />
                {copy.installSelected}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

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
    </div>
  );
}
