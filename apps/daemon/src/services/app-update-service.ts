import type { AppUpdateStatus } from "@chillclaw/contracts";

import { getAppRootDir } from "../runtime-paths.js";
import { getProductVersion } from "../product-version.js";

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubReleasePayload {
  tag_name?: string;
  prerelease?: boolean;
  draft?: boolean;
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

interface ParsedMacOSRelease {
  version: string;
  releaseUrl: string;
  downloadUrl: string;
  publishedAt?: string;
}

interface AppUpdateServiceOptions {
  currentVersion?: string;
  supported?: boolean;
  feedUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  cacheTtlMs?: number;
}

const DEFAULT_REPOSITORY = "Jian130/chillclaw";
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MACOS_INSTALLER_NAME = "ChillClaw-macOS.pkg";

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "").split("-")[0] ?? value.trim();
}

export function compareProductVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function parseStableMacOSRelease(payload: GitHubReleasePayload): ParsedMacOSRelease | undefined {
  if (payload.prerelease || payload.draft) {
    return undefined;
  }

  const version = payload.tag_name?.trim() ? normalizeVersion(payload.tag_name) : "";
  const releaseUrl = payload.html_url?.trim() || "";
  const downloadUrl = payload.assets?.find((asset) => asset.name === MACOS_INSTALLER_NAME)?.browser_download_url?.trim() || "";

  if (!version || !releaseUrl || !downloadUrl) {
    return undefined;
  }

  return {
    version,
    releaseUrl,
    downloadUrl,
    publishedAt: payload.published_at?.trim() || undefined
  };
}

function resolveFeedUrl(): string {
  return process.env.CHILLCLAW_APP_UPDATE_FEED_URL?.trim() || `https://api.github.com/repos/${DEFAULT_REPOSITORY}/releases/latest`;
}

export class AppUpdateService {
  private readonly currentVersion: string;
  private readonly supported: boolean;
  private readonly feedUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private cachedStatus?: AppUpdateStatus;
  private cachedAt?: number;

  constructor(options: AppUpdateServiceOptions = {}) {
    this.currentVersion = options.currentVersion?.trim() || getProductVersion();
    this.supported = options.supported ?? Boolean(getAppRootDir());
    this.feedUrl = options.feedUrl?.trim() || resolveFeedUrl();
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getStatus(): Promise<AppUpdateStatus> {
    if (!this.supported) {
      const status = this.buildUnsupportedStatus();
      this.cachedStatus = status;
      this.cachedAt = this.now().getTime();
      return status;
    }

    if (this.cachedStatus && this.cachedAt !== undefined && this.now().getTime() - this.cachedAt < this.cacheTtlMs) {
      return this.cachedStatus;
    }

    return this.refresh(false);
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (!this.supported) {
      const status = this.buildUnsupportedStatus();
      this.cachedStatus = status;
      this.cachedAt = this.now().getTime();
      return status;
    }

    return this.refresh(true);
  }

  private async refresh(force: boolean): Promise<AppUpdateStatus> {
    try {
      const response = await this.fetchImpl(this.feedUrl, {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": "ChillClaw-AppUpdateService"
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub release check failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as GitHubReleasePayload;
      const release = parseStableMacOSRelease(payload);

      if (!release) {
        return this.store({
          status: "error",
          supported: true,
          currentVersion: this.currentVersion,
          checkedAt: this.now().toISOString(),
          summary: "ChillClaw could not verify the latest macOS installer.",
          detail: `The stable GitHub release is missing ${MACOS_INSTALLER_NAME}, or it is not a production release yet.`
        });
      }

      if (compareProductVersions(release.version, this.currentVersion) > 0) {
        return this.store({
          status: "update-available",
          supported: true,
          currentVersion: this.currentVersion,
          latestVersion: release.version,
          downloadUrl: release.downloadUrl,
          releaseUrl: release.releaseUrl,
          publishedAt: release.publishedAt,
          checkedAt: this.now().toISOString(),
          summary: `ChillClaw ${release.version} is available.`,
          detail: `A newer stable ChillClaw macOS installer is ready to download from GitHub Releases.`
        });
      }

      return this.store({
        status: "up-to-date",
        supported: true,
        currentVersion: this.currentVersion,
        latestVersion: release.version,
        downloadUrl: release.downloadUrl,
        releaseUrl: release.releaseUrl,
        publishedAt: release.publishedAt,
        checkedAt: this.now().toISOString(),
        summary: "ChillClaw is up to date.",
        detail: force
          ? "ChillClaw checked GitHub Releases and did not find a newer stable macOS installer."
          : "No newer stable ChillClaw macOS installer is available right now."
      });
    } catch (error) {
      if (this.cachedStatus) {
        return this.store({
          ...this.cachedStatus,
          checkedAt: this.now().toISOString(),
          detail: `${this.cachedStatus.detail} ChillClaw kept the last known update result because GitHub could not be reached.`
        });
      }

      return this.store({
        status: "error",
        supported: true,
        currentVersion: this.currentVersion,
        checkedAt: this.now().toISOString(),
        summary: "ChillClaw could not reach GitHub Releases.",
        detail: error instanceof Error ? error.message : "Unknown app update error."
      });
    }
  }

  private store(status: AppUpdateStatus): AppUpdateStatus {
    this.cachedStatus = status;
    this.cachedAt = this.now().getTime();
    return status;
  }

  private buildUnsupportedStatus(): AppUpdateStatus {
    return {
      status: "unsupported",
      supported: false,
      currentVersion: this.currentVersion,
      checkedAt: this.now().toISOString(),
      summary: "App updates are available from the packaged macOS app.",
      detail: "ChillClaw can only check GitHub release updates from the packaged macOS app."
    };
  }
}
