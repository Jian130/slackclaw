import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const STATE_FILE = resolve(process.cwd(), ".data", "dev-processes.json");

function isMissingFile(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ensureStateDir() {
  await mkdir(dirname(STATE_FILE), { recursive: true });
}

export function getDevProcessStatePath() {
  return STATE_FILE;
}

export async function readDevProcessState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeDevProcessState(state) {
  await ensureStateDir();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function clearDevProcessState() {
  try {
    await rm(STATE_FILE, { force: true });
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
}

export async function getManagedProcessesStatus() {
  const state = await readDevProcessState();

  if (!state) {
    return {
      state: null,
      active: []
    };
  }

  const processes = Array.isArray(state.processes) ? state.processes : [];
  const active = processes.filter((entry) => typeof entry?.pid === "number" && isRunning(entry.pid));

  return {
    state,
    active
  };
}

export async function assertNoManagedProcessesRunning() {
  const { active, state } = await getManagedProcessesStatus();

  if (active.length === 0) {
    if (state) {
      await clearDevProcessState();
    }

    return;
  }

  const summary = active.map((entry) => `${entry.name}(${entry.pid})`).join(", ");
  throw new Error(`SlackClaw dev processes are already running: ${summary}. Run \`npm stop\` first.`);
}

export async function stopManagedProcesses(signal = "SIGTERM") {
  const { active, state } = await getManagedProcessesStatus();

  if (active.length === 0) {
    if (state) {
      await clearDevProcessState();
    }

    return {
      stopped: [],
      missing: Array.isArray(state?.processes) ? state.processes : []
    };
  }

  const stopped = [];

  for (const entry of active) {
    try {
      process.kill(-entry.pid, signal);
    } catch {
      process.kill(entry.pid, signal);
    }

    stopped.push(entry);
  }

  await clearDevProcessState();

  return {
    stopped,
    missing: []
  };
}
