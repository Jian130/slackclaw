#!/usr/bin/env node

import { spawn } from "node:child_process";

const OPENCLAW_VERSION = process.env.SLACKCLAW_OPENCLAW_VERSION ?? "2026.3.7";
const OPENCLAW_PACKAGE = `openclaw@${OPENCLAW_VERSION}`;

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    dryRun: argv.includes("--dry-run")
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        NO_COLOR: "1"
      },
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function readExistingVersion() {
  const result = await run("openclaw", ["--version"]).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  if (result.code !== 0 || !result.stdout) {
    return undefined;
  }

  return result.stdout;
}

async function ensureOpenClaw({ dryRun }) {
  const existingVersion = await readExistingVersion();

  if (existingVersion === OPENCLAW_VERSION) {
    return {
      status: "reused-existing",
      changed: false,
      hadExisting: true,
      existingVersion,
      version: existingVersion,
      message: `OpenClaw ${existingVersion} is already installed and matches the pinned version.`
    };
  }

  if (dryRun) {
    return {
      status: existingVersion ? "would-reinstall" : "would-install",
      changed: false,
      hadExisting: Boolean(existingVersion),
      existingVersion,
      version: existingVersion ?? null,
      message: existingVersion
        ? `OpenClaw ${existingVersion} is installed, but SlackClaw would replace it with ${OPENCLAW_VERSION}.`
        : `OpenClaw is not installed, and SlackClaw would install ${OPENCLAW_PACKAGE}.`
    };
  }

  const installResult = await run("npm", ["install", "--global", OPENCLAW_PACKAGE]);

  if (installResult.code !== 0) {
    return {
      status: "failed",
      changed: false,
      hadExisting: Boolean(existingVersion),
      existingVersion,
      version: null,
      message: installResult.stderr || installResult.stdout || "OpenClaw installation failed."
    };
  }

  const nextVersion = await readExistingVersion();

  return {
    status: existingVersion ? "reinstalled" : "installed",
    changed: true,
    hadExisting: Boolean(existingVersion),
    existingVersion,
    version: nextVersion ?? OPENCLAW_VERSION,
    message: existingVersion
      ? `Replaced existing OpenClaw ${existingVersion} with ${nextVersion ?? OPENCLAW_VERSION}.`
      : `Installed OpenClaw ${nextVersion ?? OPENCLAW_VERSION}.`
  };
}

const options = parseArgs(process.argv.slice(2));
const result = await ensureOpenClaw(options);

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.message);
}

if (result.status === "failed") {
  process.exitCode = 1;
}
