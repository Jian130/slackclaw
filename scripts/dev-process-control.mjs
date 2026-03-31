import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const STATE_FILE = resolve(process.cwd(), ".data", "dev-processes.json");
const DEFAULT_PORTS = {
  daemon: Number(process.env.CHILLCLAW_PORT ?? "4545"),
  ui: Number(process.env.CHILLCLAW_UI_PORT ?? "4173")
};
const execFileAsync = promisify(execFile);

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

async function captureCommand(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      env: process.env
    });
    return (stdout || stderr || "").trim();
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    return (stdout || stderr || "").trim();
  }
}

async function findListeningPid(port) {
  const output = await captureCommand("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  const line = output
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find(Boolean);

  if (!line) {
    return null;
  }

  const pid = Number(line);
  return Number.isFinite(pid) ? pid : null;
}

async function readProcessCommand(pid) {
  return captureCommand("ps", ["-p", String(pid), "-o", "command="]);
}

async function readProcessCwd(pid) {
  const output = await captureCommand("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const cwdLine = output
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("n"));
  return cwdLine ? cwdLine.slice(1) : "";
}

function normalizePath(value) {
  return value.replace(/\/+$/u, "");
}

function isManagedDaemonCommand(command, cwd) {
  const normalizedRoot = normalizePath(process.cwd());
  const normalizedCwd = normalizePath(cwd);
  return (
    normalizedCwd === normalizedRoot &&
    command.includes("apps/daemon/dist/index.js")
  );
}

function isManagedUiCommand(command, cwd) {
  const normalizedRoot = normalizePath(process.cwd());
  const normalizedUiRoot = normalizePath(resolve(process.cwd(), "apps", "desktop-ui"));
  const normalizedCwd = normalizePath(cwd);
  return (
    (normalizedCwd === normalizedRoot || normalizedCwd === normalizedUiRoot) &&
    /\bvite\b/u.test(command)
  );
}

async function describeListeningProcess(name, port) {
  const pid = await findListeningPid(port);
  if (!pid) {
    return null;
  }

  const [command, cwd] = await Promise.all([readProcessCommand(pid), readProcessCwd(pid)]);
  const isManaged = name === "daemon" ? isManagedDaemonCommand(command, cwd) : isManagedUiCommand(command, cwd);

  if (!isManaged) {
    return null;
  }

  return {
    name,
    pid,
    port,
    command,
    cwd,
    source: "orphan-port"
  };
}

function dedupeProcesses(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.name}:${entry.pid}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isRunning(pid)) {
      return true;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 100);
    });
  }

  return !isRunning(pid);
}

async function stopProcessEntries(entries, signal = "SIGTERM") {
  const stopped = [];

  for (const entry of entries) {
    if (!isRunning(entry.pid)) {
      continue;
    }

    try {
      process.kill(-entry.pid, signal);
    } catch {
      process.kill(entry.pid, signal);
    }

    const exited = await waitForProcessExit(entry.pid);
    if (!exited) {
      try {
        process.kill(-entry.pid, "SIGKILL");
      } catch {
        process.kill(entry.pid, "SIGKILL");
      }

      await waitForProcessExit(entry.pid, 2000);
    }

    stopped.push(entry);
  }

  return stopped;
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

export async function findRecoverableDevProcesses(ports = DEFAULT_PORTS) {
  const results = await Promise.all([
    describeListeningProcess("daemon", ports.daemon),
    describeListeningProcess("ui", ports.ui)
  ]);

  return dedupeProcesses(results.filter(Boolean));
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
  throw new Error(`ChillClaw dev processes are already running: ${summary}. Run \`npm stop\` first.`);
}

export async function stopRecoverableDevProcesses(signal = "SIGTERM", ports = DEFAULT_PORTS) {
  const recoverable = await findRecoverableDevProcesses(ports);
  const stopped = await stopProcessEntries(recoverable, signal);
  return {
    stopped,
    missing: []
  };
}

export async function stopManagedProcesses(signal = "SIGTERM", ports = DEFAULT_PORTS) {
  const { active, state } = await getManagedProcessesStatus();
  const recoverable = await findRecoverableDevProcesses(ports);

  const targets = dedupeProcesses([...active, ...recoverable]);

  if (targets.length === 0) {
    if (state) {
      await clearDevProcessState();
    }

    return {
      stopped: [],
      missing: Array.isArray(state?.processes) ? state.processes : []
    };
  }

  const stopped = await stopProcessEntries(targets, signal);

  await clearDevProcessState();

  return {
    stopped,
    missing: Array.isArray(state?.processes) ? state.processes.filter((entry) => !isRunning(entry.pid)) : []
  };
}
