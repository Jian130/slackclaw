import type { AppUpdateStatus } from "@chillclaw/contracts";

type WindowOpen = (url?: string | URL, target?: string, features?: string) => Window | null;

export function appUpdateDownloadLabel(status: AppUpdateStatus, fallback = "Download Update"): string {
  return status.latestVersion ? `Download ${status.latestVersion}` : fallback;
}

export function openAppUpdateDownload(status: AppUpdateStatus, openWindow: WindowOpen = window.open.bind(window)): boolean {
  if (!status.downloadUrl) {
    return false;
  }

  openWindow(status.downloadUrl, "_blank", "noopener,noreferrer");
  return true;
}

export function openAppUpdateReleaseNotes(status: AppUpdateStatus, openWindow: WindowOpen = window.open.bind(window)): boolean {
  if (!status.releaseUrl) {
    return false;
  }

  openWindow(status.releaseUrl, "_blank", "noopener,noreferrer");
  return true;
}
