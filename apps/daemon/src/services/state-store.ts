import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { EngineTaskResult } from "@slackclaw/contracts";
import { getDataDir } from "../runtime-paths.js";

interface AppState {
  selectedProfileId?: string;
  tasks: EngineTaskResult[];
  introCompletedAt?: string;
  setupCompletedAt?: string;
}

const DEFAULT_STATE: AppState = {
  selectedProfileId: undefined,
  tasks: []
};

export class StateStore {
  private readonly filePath: string;

  constructor(filePath = resolve(getDataDir(), "state.json")) {
    this.filePath = filePath;
  }

  async read(): Promise<AppState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return { ...DEFAULT_STATE, ...JSON.parse(raw) } as AppState;
    } catch {
      return DEFAULT_STATE;
    }
  }

  async write(nextState: AppState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(nextState, null, 2));
  }

  async update(updater: (current: AppState) => AppState): Promise<AppState> {
    const current = await this.read();
    const next = updater(current);
    await this.write(next);
    return next;
  }
}
