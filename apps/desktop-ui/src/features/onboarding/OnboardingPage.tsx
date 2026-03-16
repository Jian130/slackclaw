import { CheckCircle2, LoaderCircle, ShieldCheck, Sparkles, Wrench, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { markFirstRunIntroComplete } from "../../shared/api/client.js";
import { useLocale } from "../../app/providers/LocaleProvider.js";
import { useOverview } from "../../app/providers/OverviewProvider.js";
import { t } from "../../shared/i18n/messages.js";
import { Button } from "../../shared/ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/Card.js";
import { Progress } from "../../shared/ui/Progress.js";
import { PageHeader } from "../../shared/ui/PageHeader.js";
import { StatusPill } from "../../shared/ui/StatusPill.js";

function statusTone(status: "pending" | "passed" | "action-required") {
  if (status === "passed") return "success";
  if (status === "action-required") return "warning";
  return "neutral";
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const copy = t(locale).onboarding;
  const common = t(locale).common;
  const { overview, refresh, setOverview } = useOverview();
  const [step, setStep] = useState(overview?.firstRun.introCompleted ? 2 : 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (overview?.firstRun.introCompleted) {
      setStep(2);
    }
  }, [overview?.firstRun.introCompleted]);

  const allPassed = useMemo(
    () => overview?.installChecks.every((check) => check.status === "passed") ?? false,
    [overview?.installChecks]
  );

  async function handleStart() {
    setBusy(true);
    try {
      const next = await markFirstRunIntroComplete();
      setOverview(next);
      await refresh();
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <Progress label={`${step} / 2`} value={step * 50} />

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.stepOneTitle}</CardTitle>
          </CardHeader>
          <CardContent className="panel-stack">
            <p className="card__description">{copy.stepOneBody}</p>
            <div className="grid--three">
              <Card>
                <CardContent className="panel-stack">
                  <Sparkles size={20} />
                  <strong>{copy.featureOne}</strong>
                  <p className="card__description">{copy.featureOneBody}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="panel-stack">
                  <ShieldCheck size={20} />
                  <strong>{copy.featureTwo}</strong>
                  <p className="card__description">{copy.featureTwoBody}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="panel-stack">
                  <Wrench size={20} />
                  <strong>{copy.featureThree}</strong>
                  <p className="card__description">{copy.featureThreeBody}</p>
                </CardContent>
              </Card>
            </div>
            <div className="actions-row">
              <Button onClick={handleStart} size="lg" loading={busy}>
                {busy ? copy.runChecks : copy.start}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{copy.stepTwoTitle}</CardTitle>
          </CardHeader>
          <CardContent className="panel-stack">
            <p className="card__description">{copy.stepTwoBody}</p>
            <div className="check-grid">
              {overview?.installChecks.map((check) => (
                <div className="check-row" key={check.id}>
                  <div className="check-row__meta">
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                  <div className="actions-row">
                    {check.status === "passed" ? <CheckCircle2 size={18} /> : null}
                    {check.status === "pending" ? <LoaderCircle size={18} /> : null}
                    {check.status === "action-required" ? <XCircle size={18} /> : null}
                    <StatusPill tone={statusTone(check.status)}>{check.status}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
            <div className="actions-row">
              <Button onClick={() => setStep(1)} variant="outline">
                {common.back}
              </Button>
              <Button onClick={() => navigate("/deploy")} size="lg">
                {allPassed ? copy.doneTitle : copy.runChecks}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
