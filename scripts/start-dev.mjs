#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import process from "node:process";

import {
  assertNoManagedProcessesRunning,
  clearDevProcessState,
  writeDevProcessState
} from "./dev-process-control.mjs";

const rootDir = process.cwd();
const daemonPort = Number(process.env.SLACKCLAW_PORT ?? "4545");
const uiPort = Number(process.env.SLACKCLAW_UI_PORT ?? "4173");

let daemonProcess = null;
let uiProcess = null;
let shuttingDown = false;

function logStep(message) {
  console.log(`[SlackClaw start] ${message}`);
}

function fail(message) {
  console.error(`[SlackClaw start] ${message}`);
  process.exit(1);
}

function ensureLocalDependencies() {
  if (!existsSync(resolve(rootDir, "node_modules"))) {
    fail("Dependencies are missing. Run `npm install` first.");
  }
}

function runBlockingStep(label, command, args, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    logStep(`${label}...`);

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

function runBackgroundStep(label, command, args, extraEnv = {}) {
  logStep(`${label}...`);

  const child = spawn(command, args, {
    cwd: rootDir,
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

    console.error(`[SlackClaw start] ${label} error: ${error.message}`);
    void shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(
      `[SlackClaw start] ${label} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}).`
    );
    void shutdown(code ?? 1);
  });

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
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pingPort(host, port);
      logStep(`${label} is ready at http://${host}:${port}`);
      return;
    } catch (error) {
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
  try {
    await pingPort(host, port, 500);
    throw new Error(`${label} port ${port} is already in use on ${host}. Stop the existing process and retry.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already in use")) {
      throw error;
    }
  }
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
  console.error(`[SlackClaw start] ${error.message}`);
  void shutdown(1);
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.message : "Unhandled promise rejection.";
  console.error(`[SlackClaw start] ${message}`);
  void shutdown(1);
});

async function main() {
  ensureLocalDependencies();
  await assertNoManagedProcessesRunning();

  await runBlockingStep("Checking OpenClaw installation", "npm", ["run", "bootstrap:openclaw"]);
  await runBlockingStep("Building shared contracts", "npm", ["run", "build", "--workspace", "@slackclaw/contracts"]);
  await runBlockingStep("Building daemon", "npm", ["run", "build", "--workspace", "@slackclaw/daemon"]);
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

  uiProcess = runBackgroundStep("Starting UI", "npm", [
    "run",
    "dev",
    "--workspace",
    "@slackclaw/desktop-ui",
    "--",
    "--strictPort"
  ]);
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

  logStep("SlackClaw dev environment is ready.");
  logStep(`Daemon: http://127.0.0.1:${daemonPort}`);
  logStep(`UI: http://127.0.0.1:${uiPort}`);
}

await main();
