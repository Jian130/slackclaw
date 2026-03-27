import { describe, expect, it } from "vitest";

import { pluginPrimaryAction, pluginStatusLabel, pluginStatusTone } from "./PluginsPage.js";

describe("PluginsPage helpers", () => {
  it("maps managed plugin states onto shared status badge tones", () => {
    expect(pluginStatusTone("ready")).toBe("success");
    expect(pluginStatusTone("update-available")).toBe("info");
    expect(pluginStatusTone("error")).toBe("warning");
    expect(pluginStatusTone("missing")).toBe("neutral");
  });

  it("derives the primary plugin action from installation state and active dependents", () => {
    expect(
      pluginPrimaryAction({
        id: "wecom",
        label: "WeCom Plugin",
        packageSpec: "@wecom/wecom-openclaw-plugin",
        runtimePluginId: "wecom-openclaw-plugin",
        configKey: "wecom-openclaw-plugin",
        status: "missing",
        summary: "",
        detail: "",
        enabled: false,
        installed: false,
        hasUpdate: false,
        hasError: false,
        activeDependentCount: 0,
        dependencies: []
      })
    ).toBe("install");

    expect(
      pluginPrimaryAction({
        id: "wecom",
        label: "WeCom Plugin",
        packageSpec: "@wecom/wecom-openclaw-plugin",
        runtimePluginId: "wecom-openclaw-plugin",
        configKey: "wecom-openclaw-plugin",
        status: "update-available",
        summary: "",
        detail: "",
        enabled: true,
        installed: true,
        hasUpdate: true,
        hasError: false,
        activeDependentCount: 0,
        dependencies: []
      })
    ).toBe("update");

    expect(
      pluginPrimaryAction({
        id: "wecom",
        label: "WeCom Plugin",
        packageSpec: "@wecom/wecom-openclaw-plugin",
        runtimePluginId: "wecom-openclaw-plugin",
        configKey: "wecom-openclaw-plugin",
        status: "ready",
        summary: "",
        detail: "",
        enabled: true,
        installed: true,
        hasUpdate: false,
        hasError: false,
        activeDependentCount: 1,
        dependencies: []
      })
    ).toBeUndefined();
  });

  it("renders stable labels for plugin states", () => {
    expect(pluginStatusLabel("blocked")).toBe("Blocked");
    expect(pluginStatusLabel("update-available")).toBe("Update Available");
  });
});
