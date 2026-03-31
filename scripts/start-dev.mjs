#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import process from "node:process";

import {
  assertNoManagedProcessesRunning,
  clearDevProcessState,
  findRecoverableDevProcesses,
  stopRecoverableDevProcesses,
  writeDevProcessState
} from "./dev-process-control.mjs";
import { writeScriptLogLine } from "./logging.mjs";

const rootDir = process.cwd();
const daemonPort = Number(process.env.CHILLCLAW_PORT ?? "4545");
const uiPort = Number(process.env.CHILLCLAW_UI_PORT ?? "4173");
const viteBinPath = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
const SCRIPT_LABEL = "ChillClaw start";

let daemonProcess = null;
let uiProcess = null;
let shuttingDown = false;
let stepCounter = 0;

function logStep(message, options = {}) {
  const prefix = options.step ? `${String(++stepCounter).padStart(2, "0")}. ` : "";
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "start-dev.logStep",
    message: `${prefix}${message}`
  });
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
    return value;
  }

  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fail(message) {
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "start-dev.fail",
    message,
    stream: "stderr"
  });
  process.exit(1);
}

function captureCommand(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", () => {
      resolvePromise("");
    });

    child.on("exit", () => {
      resolvePromise(stdout.trim() || stderr.trim());
    });
  });
}

function ensureLocalDependencies() {
  logStep("Checking local JavaScript dependencies", { step: true });
  if (!existsSync(resolve(rootDir, "node_modules"))) {
    fail("Dependencies are missing. Run `npm install` first.");
  }

  logStep("Local dependencies are present.");
}

function runBlockingStep(label, command, args, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    logStep(label, { step: true });
    logStep(`Running: ${command} ${args.map((arg) => shellQuote(arg)).join(" ")}`);

    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        logStep(`${label} complete.`);
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          signal
            ? `${label} exited from signal ${signal}.`
            : `${label} failed with exit code ${code ?? "unknown"}.`
        )
      );
    });
  });
}

function runBackgroundStep(label, command, args, options = {}) {
  const { cwd = rootDir, extraEnv = {} } = options;
  logStep(label, { step: true });
  logStep(`Launching: ${command} ${args.map((arg) => shellQuote(arg)).join(" ")}`);

  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    detached: true,
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    writeScriptLogLine({
      label: SCRIPT_LABEL,
      scope: "start-dev.runBackgroundStep.childError",
      message: `${label} error: ${error.message}`,
      stream: "stderr"
    });
    void shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    writeScriptLogLine({
      label: SCRIPT_LABEL,
      scope: "start-dev.runBackgroundStep.childExit",
      message: `${label} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}).`,
      stream: "stderr"
    });
    void shutdown(code ?? 1);
  });

  child.unref();
  return child;
}

function wait(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function pingPort(host, port, timeoutMs = 2000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      socket.destroy();
      resolvePromise();
    });

    socket.once("timeout", () => {
      socket.destroy();
      rejectPromise(new Error("Connection timed out."));
    });

    socket.once("error", (error) => {
      socket.destroy();
      rejectPromise(error);
    });

    socket.connect(port, host);
  });
}

async function waitForPort(label, host, port, attempts = 60, delayMs = 1000) {
  logStep(`Waiting for ${label} on http://${host}:${port}`);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pingPort(host, port);
      logStep(`${label} is ready at http://${host}:${port}`);
      return;
    } catch (error) {
      if (attempt === 1 || attempt % 5 === 0) {
        logStep(`Still waiting for ${label} (${attempt}/${attempts})`);
      }

      if (attempt === attempts) {
        throw new Error(
          `${label} did not become ready after ${attempts} attempts: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }

    await wait(delayMs);
  }
}

async function ensurePortIsFree(label, host, port) {
  logStep(`Checking ${label} port ${port}`, { step: true });
  try {
    await pingPort(host, port, 500);
    const portOwner = await captureCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
    const ownerMessage = portOwner ? ` Current listener:\n${portOwner}` : "";
    throw new Error(
      `${label} port ${port} is already in use on ${host}. Stop the existing process and retry.${ownerMessage}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("already in use")) {
      throw error;
    }
  }

  logStep(`${label} port ${port} is free.`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logStep("Shutting down child processes...");

  if (uiProcess && !uiProcess.killed) {
    try {
      process.kill(-uiProcess.pid, "SIGTERM");
    } catch {
      uiProcess.kill("SIGTERM");
    }
  }

  if (daemonProcess && !daemonProcess.killed) {
    try {
      process.kill(-daemonProcess.pid, "SIGTERM");
    } catch {
      daemonProcess.kill("SIGTERM");
    }
  }

  await clearDevProcessState();
  await wait(500);
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

process.on("uncaughtException", (error) => {
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "start-dev.processUncaughtException",
    message: error.message,
    stream: "stderr"
  });
  void shutdown(1);
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.message : "Unhandled promise rejection.";
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "start-dev.processUnhandledRejection",
    message,
    stream: "stderr"
  });
  void shutdown(1);
});

async function main() {
  logStep("Starting ChillClaw local development environment");
  ensureLocalDependencies();
  logStep("Checking for an existing managed ChillClaw dev session", { step: true });
  const orphanedProcesses = await findRecoverableDevProcesses({
    daemon: daemonPort,
    ui: uiPort
  });
  if (orphanedProcesses.length > 0) {
    const summary = orphanedProcesses.map((entry) => `${entry.name}(${entry.pid})`).join(", ");
    logStep(`Found orphaned ChillClaw dev processes from this repo: ${summary}`);
    await stopRecoverableDevProcesses("SIGTERM", {
      daemon: daemonPort,
      ui: uiPort
    });
    logStep("Recovered orphaned ChillClaw dev processes.");
  }
  await assertNoManagedProcessesRunning();
  logStep("No managed ChillClaw dev processes are already running.");

  logStep("Skipping OpenClaw bootstrap during npm start. Use the ChillClaw install flow or run `npm run bootstrap:openclaw` manually if needed.");
  await runBlockingStep("Building shared contracts", "npm", ["run", "build", "--workspace", "@chillclaw/contracts"]);
  await runBlockingStep("Building daemon", "npm", ["run", "build", "--workspace", "@chillclaw/daemon"]);
  await ensurePortIsFree("Daemon", "127.0.0.1", daemonPort);
  await ensurePortIsFree("UI", "127.0.0.1", uiPort);

  daemonProcess = runBackgroundStep("Starting daemon", "node", ["./apps/daemon/dist/index.js"]);
  await writeDevProcessState({
    startedAt: new Date().toISOString(),
    rootDir,
    ports: { daemon: daemonPort, ui: uiPort },
    processes: [{ name: "daemon", pid: daemonProcess.pid }]
  });
  await waitForPort("Daemon", "127.0.0.1", daemonPort);

  uiProcess = runBackgroundStep("Starting UI", "node", [
    viteBinPath,
    "--host",
    "127.0.0.1",
    "--strictPort",
    "--port",
    String(uiPort)
  ], {
    cwd: resolve(rootDir, "apps", "desktop-ui")
  });
  await writeDevProcessState({
    startedAt: new Date().toISOString(),
    rootDir,
    ports: { daemon: daemonPort, ui: uiPort },
    processes: [
      { name: "daemon", pid: daemonProcess.pid },
      { name: "ui", pid: uiProcess.pid }
    ]
  });
  await waitForPort("UI", "127.0.0.1", uiPort);

  logStep("ChillClaw dev environment is ready.");
  logStep(`Daemon: http://127.0.0.1:${daemonPort}`);
  logStep(`UI: http://127.0.0.1:${uiPort}`);
}

await main();
