#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const OPENCLAW_VERSION = process.env.SLACKCLAW_OPENCLAW_VERSION ?? "2026.3.7";
const OPENCLAW_PACKAGE = `openclaw@${OPENCLAW_VERSION}`;
const LOCAL_INSTALL_PREFIX = process.env.SLACKCLAW_OPENCLAW_INSTALL_PREFIX;

function managedOpenClawBinPath() {
  return LOCAL_INSTALL_PREFIX ? resolve(LOCAL_INSTALL_PREFIX, "node_modules", ".bin", "openclaw") : undefined;
}

async function fileExists(pathname) {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveNpmPath() {
  const candidates = [
    process.env.npm_execpath,
    "/opt/homebrew/bin/npm",
    "/usr/local/bin/npm",
    "/usr/bin/npm",
    process.env.HOME ? resolve(process.env.HOME, ".nvm/current/bin/npm") : undefined
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return "npm";
}

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
  const candidates = [managedOpenClawBinPath(), "openclaw"].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate !== "openclaw") {
      try {
        await access(candidate, constants.F_OK);
      } catch {
        continue;
      }
    }

    const result = await run(candidate, ["--version"]).catch(() => ({
      code: 1,
      stdout: "",
      stderr: ""
    }));

    if (result.code === 0 && result.stdout) {
      return result.stdout;
    }
  }

  return undefined;
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
      message: LOCAL_INSTALL_PREFIX
        ? `OpenClaw ${existingVersion} is already available for SlackClaw in ${LOCAL_INSTALL_PREFIX}.`
        : `OpenClaw ${existingVersion} is already installed and matches the pinned version.`
    };
  }

  if (dryRun) {
    return {
      status: existingVersion ? "would-reinstall" : "would-install",
      changed: false,
      hadExisting: Boolean(existingVersion),
      existingVersion,
      version: existingVersion ?? null,
      message: LOCAL_INSTALL_PREFIX
        ? existingVersion
          ? `SlackClaw would deploy OpenClaw ${OPENCLAW_VERSION} into ${LOCAL_INSTALL_PREFIX} instead of reusing ${existingVersion}.`
          : `SlackClaw would deploy ${OPENCLAW_PACKAGE} into ${LOCAL_INSTALL_PREFIX}.`
        : existingVersion
          ? `OpenClaw ${existingVersion} is installed, but SlackClaw would replace it with ${OPENCLAW_VERSION}.`
          : `OpenClaw is not installed, and SlackClaw would install ${OPENCLAW_PACKAGE}.`
    };
  }

  if (LOCAL_INSTALL_PREFIX) {
    await mkdir(LOCAL_INSTALL_PREFIX, { recursive: true });
  }

  const npmPath = await resolveNpmPath();
  const installResult = await run(
    npmPath,
    LOCAL_INSTALL_PREFIX ? ["install", "--prefix", LOCAL_INSTALL_PREFIX, OPENCLAW_PACKAGE] : ["install", "--global", OPENCLAW_PACKAGE]
  ).catch((error) => ({
    code: 1,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error)
  }));

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
    message: LOCAL_INSTALL_PREFIX
      ? existingVersion
        ? `SlackClaw deployed OpenClaw ${nextVersion ?? OPENCLAW_VERSION} into ${LOCAL_INSTALL_PREFIX} instead of reusing ${existingVersion}.`
        : `SlackClaw deployed OpenClaw ${nextVersion ?? OPENCLAW_VERSION} into ${LOCAL_INSTALL_PREFIX}.`
      : existingVersion
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
