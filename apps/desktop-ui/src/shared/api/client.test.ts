import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAIMember,
  completeOnboarding,
  fetchAITeamOverview,
  fetchCapabilityOverview,
  fetchPluginConfig,
  fetchOverview,
  fetchToolOverview,
  redoOnboarding,
  resetClientReadStateForTests,
  updatePlugin
} from "./client.js";

afterEach(() => {
  resetClientReadStateForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API client GET dedupe", () => {
  it("reuses one browser request for identical concurrent GETs", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ appName: string }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ appName: "ChillClaw" })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([fetchOverview(), fetchOverview()]);

    expect(first).toEqual({ appName: "ChillClaw" });
    expect(second).toEqual({ appName: "ChillClaw" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("appends fresh=1 for manual refresh reads", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ members: never[] }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ members: [] })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAITeamOverview({ fresh: true });

    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    expect(String(firstCall?.[0] ?? "")).toContain("/ai-team/overview?fresh=1");
  });

  it("reuses a recent successful GET result for a short follow-up read", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ appName: string }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ appName: "ChillClaw" })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchOverview();
    const second = await fetchOverview();

    expect(first).toEqual({ appName: "ChillClaw" });
    expect(second).toEqual({ appName: "ChillClaw" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears cached GET results after a mutation succeeds", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<unknown> }>
    >(async (input) => ({
      ok: true,
      json: async () =>
        String(input).includes("/ai-members")
          ? { overview: { members: [] } }
          : { members: [] }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAITeamOverview();
    await createAIMember({
      name: "Test",
      jobTitle: "Analyst",
      avatar: { presetId: "operator", accent: "#000", emoji: "🦊", theme: "sunrise" },
      brainEntryId: "brain-1",
      personality: "",
      soul: "",
      workStyles: [],
      skillIds: [],
      knowledgePackIds: [],
      capabilitySettings: { memoryEnabled: true, contextWindow: 128000 }
    });
    await fetchAITeamOverview();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("posts to the onboarding reset endpoint", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ draft: { currentStep: string } }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ draft: { currentStep: "welcome" } })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await redoOnboarding();

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/onboarding/reset");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("treats plugin config like the other cached daemon snapshots", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ entries: never[] }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ entries: [] })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPluginConfig();
    await fetchPluginConfig();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats capability and tool overviews like cached daemon snapshots", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ entries: never[] }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ entries: [] })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCapabilityOverview();
    await fetchCapabilityOverview();
    await fetchToolOverview();
    await fetchToolOverview();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/capabilities/overview");
    expect(String(fetchMock.mock.calls[1]?.[0] ?? "")).toContain("/tools/overview");
  });

  it("posts plugin update mutations to the dedicated plugin endpoint", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: true; json: () => Promise<{ message: string; pluginConfig: { entries: never[] } }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ message: "Updated", pluginConfig: { entries: [] } })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updatePlugin("wecom");

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/plugins/wecom/update");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("aborts long onboarding mutations when the browser request deadline expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<never>>((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = completeOnboarding({ destination: "dashboard" });
    const assertion = expect(request).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT"
    });
    await vi.advanceTimersByTimeAsync(1_200_000);

    await assertion;
    expect((fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal | undefined)?.aborted).toBe(true);
  });
});
