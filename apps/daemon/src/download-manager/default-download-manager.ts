import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  getDataDir,
  getDownloadCacheDir,
  getDownloadManagerStatePath,
  getDownloadTempDir,
  getManagedOllamaModelsDir,
  getRuntimeBundleDir
} from "../runtime-paths.js";
import type { EventBusService } from "../services/event-bus-service.js";
import { DownloadManager, type DownloadManagerState } from "./download-manager.js";

export function createDownloadManager(eventBus?: EventBusService): DownloadManager {
  return new DownloadManager({
    readState: readDownloadManagerState,
    writeState: writeDownloadManagerState,
    cacheDir: getDownloadCacheDir(),
    tempDir: getDownloadTempDir(),
    runtimeDir: getRuntimeBundleDir() ?? getDataDir(),
    modelsDir: getManagedOllamaModelsDir(),
    publishEvent: (event) => eventBus?.publish(event)
  });
}

async function readDownloadManagerState(): Promise<DownloadManagerState | undefined> {
  try {
    return JSON.parse(await readFile(getDownloadManagerStatePath(), "utf8")) as DownloadManagerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeDownloadManagerState(state: DownloadManagerState): Promise<void> {
  const statePath = getDownloadManagerStatePath();
  await mkdir(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2));
  await rename(tempPath, statePath);
}
