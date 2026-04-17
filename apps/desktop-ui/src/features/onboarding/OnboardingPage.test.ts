import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { onboardingAuthMethodBody, onboardingAuthMethodLabel } from "./OnboardingPage";
import { onboardingCopy } from "./copy";

describe("OnboardingPage CTA styling", () => {
  it("uses one shared class hook for forward onboarding actions", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source.match(/onboarding-primary-action/g)).toHaveLength(6);
  });

  it("prefers the provider-defined auth method label and description for onboarding cards", () => {
    const copy = onboardingCopy("en");
    const method = {
      id: "minimax-api-key-cn",
      label: "China API Key",
      kind: "api-key" as const,
      description: "Use the China MiniMax endpoint (api.minimaxi.com).",
      interactive: false,
      fields: []
    };

    expect(onboardingAuthMethodLabel(copy, method)).toBe("China API Key");
    expect(onboardingAuthMethodBody(copy, method)).toBe("Use the China MiniMax endpoint (api.minimaxi.com).");
  });

  it("falls back to the generic auth method copy when custom method text is missing", () => {
    const copy = onboardingCopy("en");
    const method = {
      id: "openai-api-key",
      label: "",
      kind: "api-key" as const,
      description: "",
      interactive: false,
      fields: []
    };

    expect(onboardingAuthMethodLabel(copy, method)).toBe("API Key");
    expect(onboardingAuthMethodBody(copy, method)).toBe("Use your API key for quick setup");
  });

  it("sizes auth method cards from the provider method count instead of a fixed single-column modifier", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("--onboarding-auth-method-count");
    expect(source).not.toContain("onboarding-auth-method-grid--single");
  });

  it("submits the final employee draft through onboarding completion instead of a separate save round trip", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("const result = await completeOnboarding({ employee: draft });");
    expect(source).not.toContain("await saveEmployeeDraftToDaemon(draft);");
  });

  it("includes the new local-first step title and cloud handoff copy", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("copy.localModelSetupTitle");
    expect(source).toContain("copy.localModelCloudFallbackCountdown");
  });

  it("uses a dedicated 2-second delay for the cloud handoff", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("MODEL_CLOUD_HANDOFF_DELAY_MS = 2_000");
  });

  it("auto-starts the local runtime flow through the existing install and repair APIs", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("const autoLocalRuntimeAction");
    expect(source).toContain("void handleLocalRuntimeAction(autoLocalRuntimeAction);");
    expect(source).toContain('action === "repair" ? await repairLocalModelRuntime() : await installLocalModelRuntime()');
  });

  it("uses onboarding-owned local runtime state and applies local runtime onboarding responses", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("resolveOnboardingLocalRuntime");
    expect(source).toContain("onboardingLocalRuntime: onboardingState?.localRuntime");
    expect(source).toContain("if (result.onboarding)");
    expect(source).toContain("await applyOnboardingState(result.onboarding)");
  });

  it("hydrates step 4 from onboarding state instead of fetching overview and model config together", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("const nextState = await fetchOnboardingState({ fresh: true });");
    expect(source).not.toContain("Promise.all([readFreshOverview(), readFreshModelConfig()])");
  });

  it("does not retry onboarding state forever when the provider catalog is empty", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).not.toContain('if (currentStep !== "model" || !onboardingState || modelPickerProviders.length > 0)');
  });

  it("shows structured local-model download info instead of only the raw daemon detail line", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("describeOnboardingLocalModelDownload");
    expect(source).toContain("onboarding-model-download-card");
    expect(source).toContain("copy.localModelDownloadResumeNote");
  });

  it("recovers timed-out onboarding mutations by refreshing daemon-owned operation state", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain("recoverOnboardingTimeout");
    expect(source).toContain('code?: string; timedOut?: boolean');
    expect(source).toContain("const next = await refreshOnboardingState();");
    expect(source).toContain("copy.operationStillRunning");
  });

  it("shows the shared busy button animation while advancing from the model step", () => {
    const source = readFileSync(fileURLToPath(new URL("./OnboardingPage.tsx", import.meta.url)), "utf8");

    expect(source).toContain('const [modelAdvanceBusy, setModelAdvanceBusy] = useState(false);');
    expect(source).toContain("setModelAdvanceBusy(true);");
    expect(source).toContain("setModelAdvanceBusy(false);");
    expect(source).toContain('loading={modelAdvanceBusy}');
  });
});
