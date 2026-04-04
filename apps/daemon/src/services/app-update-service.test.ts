import test from "node:test";
import assert from "node:assert/strict";

import {
  AppUpdateService,
  compareProductVersions,
  parseStableMacOSRelease
} from "./app-update-service.js";

function buildRelease(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tag_name: "v0.1.4",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
    published_at: "2026-04-04T10:00:00.000Z",
    assets: [
      {
        name: "ChillClaw-macOS.pkg",
        browser_download_url: "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.pkg"
      }
    ],
    ...overrides
  };
}

test("compareProductVersions orders semantic app versions", () => {
  assert.equal(compareProductVersions("0.1.2", "0.1.2"), 0);
  assert.equal(compareProductVersions("0.1.3", "0.1.2") > 0, true);
  assert.equal(compareProductVersions("1.0.0", "0.9.9") > 0, true);
  assert.equal(compareProductVersions("0.1.2", "0.1.10") < 0, true);
});

test("parseStableMacOSRelease extracts release metadata for the signed macOS installer", () => {
  const release = parseStableMacOSRelease(buildRelease());

  assert.deepEqual(release, {
    version: "0.1.4",
    releaseUrl: "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
    downloadUrl: "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.pkg",
    publishedAt: "2026-04-04T10:00:00.000Z"
  });
});

test("parseStableMacOSRelease rejects prereleases and missing installer assets", () => {
  assert.equal(parseStableMacOSRelease(buildRelease({ prerelease: true })), undefined);
  assert.equal(parseStableMacOSRelease(buildRelease({ assets: [] })), undefined);
});

test("app update service returns unsupported status outside the packaged app context", async () => {
  const service = new AppUpdateService({
    currentVersion: "0.1.2",
    supported: false,
    now: () => new Date("2026-04-04T11:00:00.000Z")
  });

  const status = await service.getStatus();

  assert.equal(status.status, "unsupported");
  assert.equal(status.currentVersion, "0.1.2");
  assert.match(status.summary, /available from the packaged macOS app/i);
});

test("app update service reports an available stable release and caches the result for the ttl window", async () => {
  let fetchCount = 0;
  const service = new AppUpdateService({
    currentVersion: "0.1.2",
    supported: true,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    now: () => new Date("2026-04-04T11:00:00.000Z"),
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify(buildRelease()), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const first = await service.getStatus();
  const second = await service.getStatus();

  assert.equal(fetchCount, 1);
  assert.equal(first.status, "update-available");
  assert.equal(first.latestVersion, "0.1.4");
  assert.equal(first.downloadUrl?.endsWith("/ChillClaw-macOS.pkg"), true);
  assert.deepEqual(second, first);
});

test("app update service falls back to the last known status when GitHub cannot be reached", async () => {
  let shouldFail = false;
  const service = new AppUpdateService({
    currentVersion: "0.1.2",
    supported: true,
    cacheTtlMs: 0,
    now: () => new Date("2026-04-04T11:00:00.000Z"),
    fetchImpl: async () => {
      if (shouldFail) {
        throw new Error("network unavailable");
      }

      return new Response(JSON.stringify(buildRelease()), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const first = await service.checkForUpdates();
  shouldFail = true;
  const second = await service.checkForUpdates();

  assert.equal(first.status, "update-available");
  assert.equal(second.status, "update-available");
  assert.match(second.detail, /last known update result/i);
});

test("app update service returns an error when the stable release is missing the macOS installer", async () => {
  const service = new AppUpdateService({
    currentVersion: "0.1.2",
    supported: true,
    now: () => new Date("2026-04-04T11:00:00.000Z"),
    fetchImpl: async () =>
      new Response(JSON.stringify(buildRelease({ assets: [{ name: "notes.txt", browser_download_url: "https://example.com/notes.txt" }] })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
  });

  const status = await service.checkForUpdates();

  assert.equal(status.status, "error");
  assert.match(status.detail, /ChillClaw-macOS\.pkg/i);
});
