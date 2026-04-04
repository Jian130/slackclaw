import { describe, expect, it, vi } from "vitest";
import type { AppUpdateStatus } from "@chillclaw/contracts";

import { openAppUpdateDownload } from "./app-updates.js";

describe("openAppUpdateDownload", () => {
  it("opens the daemon-provided stable installer URL", () => {
    const open = vi.fn();
    const status: AppUpdateStatus = {
      status: "update-available",
      supported: true,
      currentVersion: "0.1.2",
      latestVersion: "0.1.4",
      downloadUrl: "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.pkg",
      releaseUrl: "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
      publishedAt: "2026-04-04T10:00:00.000Z",
      checkedAt: "2026-04-04T11:00:00.000Z",
      summary: "ChillClaw 0.1.4 is available.",
      detail: "Download the latest signed installer."
    };

    expect(openAppUpdateDownload(status, open)).toBe(true);
    expect(open).toHaveBeenCalledWith(status.downloadUrl, "_blank", "noopener,noreferrer");
  });
});
