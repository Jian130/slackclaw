#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const OPENCLAW_VERSION_OVERRIDE = process.env.CHILLCLAW_OPENCLAW_VERSION?.trim() || undefined;
const OPENCLAW_INSTALL_TARGET = OPENCLAW_VERSION_OVERRIDE ?? "latest";
const OPENCLAW_PACKAGE = `openclaw@${OPENCLAW_INSTALL_TARGET}`;
const LOCAL_INSTALL_PREFIX = process.env.CHILLCLAW_OPENCLAW_INSTALL_PREFIX;

function compareOpenClawVersions(left, right) {
  if (!left || !right) {
    return undefined;
  }

  const leftParts = String(left)
    .replace(/^v/i, "")
    .split(/[^\d]+/u)
    .filter(Boolean)
    .map((part) => Number(part));
  const rightParts = String(right)
    .replace(/^v/i, "")
    .split(/[^\d]+/u)
    .filter(Boolean)
    .map((part) => Number(part));

  if (leftParts.length === 0 || rightParts.length === 0) {
    return undefined;
  }

  const limit = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < limit; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function isCompatibleOpenClawVersion(version) {
  if (!version) {
    return false;
  }

  if (!OPENCLAW_VERSION_OVERRIDE) {
    return true;
  }

  const comparison = compareOpenClawVersions(version, OPENCLAW_VERSION_OVERRIDE);
  return comparison !== undefined && comparison >= 0;
}

function installTargetSummary() {
  return OPENCLAW_VERSION_OVERRIDE ?? "the latest available version";
}

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

function shouldLogBootstrapCommands() {
  if (process.env.CHILLCLAW_LOG_BOOTSTRAP_COMMANDS === "0") {
    return false;
  }

  return true;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
    return value;
  }

  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function logBootstrapCommand(command, args) {
  if (!shouldLogBootstrapCommands()) {
    return;
  }

  const renderedArgs = args.map((arg) => shellQuote(arg)).join(" ");
  console.log(`[ChillClaw bootstrap] ${command}${args.length > 0 ? ` ${renderedArgs}` : ""}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    logBootstrapCommand(command, args);
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

  if (isCompatibleOpenClawVersion(existingVersion)) {
    return {
      status: "reused-existing",
      changed: false,
      hadExisting: true,
      existingVersion,
      version: existingVersion,
      message: LOCAL_INSTALL_PREFIX
        ? `OpenClaw ${existingVersion} is already available for ChillClaw in ${LOCAL_INSTALL_PREFIX}.`
        : OPENCLAW_VERSION_OVERRIDE
          ? `OpenClaw ${existingVersion} is already installed and meets ChillClaw's requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`
          : `OpenClaw ${existingVersion} is already installed and ready for ChillClaw.`
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
          ? `ChillClaw would deploy OpenClaw ${installTargetSummary()} into ${LOCAL_INSTALL_PREFIX} instead of reusing ${existingVersion}.`
          : `ChillClaw would deploy ${OPENCLAW_PACKAGE} into ${LOCAL_INSTALL_PREFIX}.`
        : existingVersion
          ? OPENCLAW_VERSION_OVERRIDE
            ? `OpenClaw ${existingVersion} is installed, but ChillClaw would replace it because it is older than the requested version floor ${OPENCLAW_VERSION_OVERRIDE}.`
            : `OpenClaw ${existingVersion} is installed and ChillClaw would reuse it.`
          : `OpenClaw is not installed, and ChillClaw would install ${OPENCLAW_PACKAGE}.`
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
    version: nextVersion ?? null,
    message: LOCAL_INSTALL_PREFIX
      ? existingVersion
        ? `ChillClaw deployed OpenClaw ${nextVersion ?? installTargetSummary()} into ${LOCAL_INSTALL_PREFIX} instead of reusing ${existingVersion}.`
        : `ChillClaw deployed OpenClaw ${nextVersion ?? installTargetSummary()} into ${LOCAL_INSTALL_PREFIX}.`
      : existingVersion
        ? `Replaced existing OpenClaw ${existingVersion} with ${nextVersion ?? installTargetSummary()}.`
        : `Installed OpenClaw ${nextVersion ?? installTargetSummary()}.`
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
