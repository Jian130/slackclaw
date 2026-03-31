import { describe, expect, it } from "vitest";

import { defaultTemplates } from "@chillclaw/contracts";
import { localeOptions, t } from "./shared/i18n/messages.js";
import {
  defaultWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState
} from "./shared/state/workspace-store.js";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

Object.defineProperty(globalThis, "localStorage", {
  value: createMemoryStorage(),
  configurable: true
});

describe("desktop-ui localization", () => {
  it("keeps the five supported UI locales", () => {
    expect(localeOptions.map((option) => option.value)).toEqual(["en", "zh", "ja", "ko", "es"]);
  });

  it("falls back to translated shell labels while preserving page copy", () => {
    expect(t("zh").shell.deploy).toBe("部署");
    expect(t("ja").shell.dashboard).toBe("ダッシュボード");
    expect(t("es").deploy.title).toBe("Deploy OpenClaw");
  });
});

describe("workspace store", () => {
  it("ships a seeded digital employee roster", () => {
    expect(defaultWorkspaceState.employees.length).toBeGreaterThan(4);
    expect(defaultTemplates.length).toBeGreaterThan(4);
  });

  it("round-trips local workspace state through localStorage", () => {
    const next = {
      ...defaultWorkspaceState,
      teamVision: "A sharper operating system for small teams."
    };

    saveWorkspaceState(next);
    expect(loadWorkspaceState()?.teamVision).toBe(next.teamVision);
  });
});
