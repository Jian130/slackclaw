#!/usr/bin/env node

import { spawn } from "node:child_process";
import { chmod, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, "dist/macos");
const STAGING_DIR = resolve(ROOT, "dist/.macos-staging");
const BUILD_DIR = resolve(STAGING_DIR, ".build");
const APP_NAME = "SlackClaw";
const APP_VERSION = "0.1.2";
const APP_BUNDLE = resolve(STAGING_DIR, `${APP_NAME}.app`);
const APP_CONTENTS = resolve(APP_BUNDLE, "Contents");
const APP_MACOS = resolve(APP_CONTENTS, "MacOS");
const APP_RESOURCES = resolve(APP_CONTENTS, "Resources");
const APP_RUNTIME = resolve(APP_RESOURCES, "runtime");
const APP_RUNTIME_ROOT = resolve(APP_RESOURCES, "app");
const APP_UI = resolve(APP_RUNTIME_ROOT, "ui");
const APP_SCRIPTS = resolve(APP_RUNTIME_ROOT, "scripts");
const PACKAGED_DAEMON_BUNDLE = resolve(BUILD_DIR, "slackclaw-daemon.cjs");
const PACKAGED_DAEMON_BINARY = resolve(APP_RUNTIME, "slackclaw-daemon");
const MACOS_NATIVE_PACKAGE_DIR = resolve(ROOT, "apps/macos-native");
const NATIVE_EXECUTABLE_NAME = "SlackClawNative";
const APP_NATIVE_EXECUTABLE = resolve(APP_MACOS, APP_NAME);
const PKG_OUTPUT = resolve(DIST_DIR, `${APP_NAME}-macOS.pkg`);
const LAUNCH_AGENT_LABEL = "ai.slackclaw.daemon";

function parseArgs(argv) {
  return {
    skipBuild: argv.includes("--skip-build")
  };
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "inherit"],
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

async function ensureBuild(skipBuild) {
  if (!skipBuild) {
    await run("npm", ["run", "build"]);
  }
}

function pkgTarget() {
  if (process.platform !== "darwin") {
    throw new Error("The macOS installer build must run on macOS.");
  }

  if (process.arch === "arm64") {
    return "node18-macos-arm64";
  }

  if (process.arch === "x64") {
    return "node18-macos-x64";
  }

  throw new Error(`Unsupported macOS packaging architecture: ${process.arch}`);
}

async function buildStandaloneDaemon() {
  await mkdir(BUILD_DIR, { recursive: true });

  await run("npx", [
    "esbuild",
    "apps/daemon/src/index.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node18",
    `--outfile=${PACKAGED_DAEMON_BUNDLE}`
  ]);

  await run("npx", [
    "pkg",
    "-t",
    pkgTarget(),
    "--output",
    PACKAGED_DAEMON_BINARY,
    PACKAGED_DAEMON_BUNDLE
  ]);

  await chmod(PACKAGED_DAEMON_BINARY, 0o755);
}

async function buildNativeClient() {
  await run("swift", [
    "build",
    "--package-path",
    MACOS_NATIVE_PACKAGE_DIR,
    "-c",
    "release",
    "--product",
    NATIVE_EXECUTABLE_NAME
  ]);

  const binDir = await capture("swift", [
    "build",
    "--package-path",
    MACOS_NATIVE_PACKAGE_DIR,
    "-c",
    "release",
    "--product",
    NATIVE_EXECUTABLE_NAME,
    "--show-bin-path"
  ]);

  const nativeBinary = resolve(binDir, NATIVE_EXECUTABLE_NAME);
  await copyFile(nativeBinary, APP_NATIVE_EXECUTABLE);
  await chmod(APP_NATIVE_EXECUTABLE, 0o755);
}

function installLaunchAgentScript() {
  return `#!/bin/sh
set -eu

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/SlackClaw"
DATA_DIR="$APP_SUPPORT/data"
LOG_DIR="$APP_SUPPORT/logs"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LABEL="${LAUNCH_AGENT_LABEL}"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
DAEMON_BIN="$APP_ROOT/runtime/slackclaw-daemon"
STATIC_DIR="$APP_ROOT/app/ui"
BOOTSTRAP_SCRIPT="$APP_ROOT/app/scripts/bootstrap-openclaw.mjs"

mkdir -p "$DATA_DIR" "$LOG_DIR" "$LAUNCH_AGENTS_DIR"

RUNNER_SCRIPT="$APP_ROOT/app/scripts/run-daemon.sh"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
      <string>$RUNNER_SCRIPT</string>
      <string>launchagent</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>SLACKCLAW_APP_ROOT</key>
      <string>$APP_ROOT</string>
      <key>SLACKCLAW_PORT</key>
      <string>4545</string>
      <key>SLACKCLAW_DATA_DIR</key>
      <string>$DATA_DIR</string>
      <key>SLACKCLAW_STATIC_DIR</key>
      <string>$STATIC_DIR</string>
      <key>SLACKCLAW_OPENCLAW_BOOTSTRAP_SCRIPT</key>
      <string>$BOOTSTRAP_SCRIPT</string>
      <key>SLACKCLAW_LAUNCHAGENT_LABEL</key>
      <string>$LABEL</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/daemon.log</string>
    <key>ProcessType</key>
    <string>Background</string>
  </dict>
</plist>
EOF

/bin/launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "gui/$UID" "$PLIST_PATH"
/bin/launchctl kickstart -k "gui/$UID/$LABEL"
`;
}

function runDaemonScript() {
  return `#!/bin/sh
set -eu

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/SlackClaw"
LOG_DIR="$APP_SUPPORT/logs"
DAEMON_BIN="$APP_ROOT/runtime/slackclaw-daemon"
START_MODE="\${1:-unknown}"

mkdir -p "$LOG_DIR"
/bin/echo "$(date '+%Y-%m-%d %H:%M:%S') starting packaged daemon via $START_MODE using $DAEMON_BIN" >>"$LOG_DIR/daemon.log"
exec "$DAEMON_BIN"
`;
}

function restartLaunchAgentScript() {
  return `#!/bin/sh
set -eu
"$(dirname "$0")/install-launchagent.sh"
`;
}

function uninstallLaunchAgentScript() {
  return `#!/bin/sh
set -eu

LABEL="${LAUNCH_AGENT_LABEL}"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

/bin/launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
/bin/rm -f "$PLIST_PATH"
`;
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>SlackClaw</string>
  <key>CFBundleExecutable</key>
  <string>SlackClaw</string>
  <key>CFBundleIdentifier</key>
  <string>ai.slackclaw.desktop</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>SlackClaw</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${APP_VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

async function stageBundle() {
  await rm(STAGING_DIR, { recursive: true, force: true });
  await mkdir(APP_MACOS, { recursive: true });
  await mkdir(APP_RUNTIME, { recursive: true });
  await mkdir(APP_UI, { recursive: true });
  await mkdir(APP_SCRIPTS, { recursive: true });

  await buildStandaloneDaemon();
  await buildNativeClient();
  await cp(resolve(ROOT, "apps/desktop-ui/dist"), APP_UI, { recursive: true });
  await copyFile(resolve(ROOT, "scripts/bootstrap-openclaw.mjs"), resolve(APP_SCRIPTS, "bootstrap-openclaw.mjs"));

  await writeFile(resolve(APP_SCRIPTS, "install-launchagent.sh"), installLaunchAgentScript());
  await writeFile(resolve(APP_SCRIPTS, "restart-launchagent.sh"), restartLaunchAgentScript());
  await writeFile(resolve(APP_SCRIPTS, "run-daemon.sh"), runDaemonScript());
  await writeFile(resolve(APP_SCRIPTS, "uninstall-launchagent.sh"), uninstallLaunchAgentScript());
  await chmod(resolve(APP_SCRIPTS, "install-launchagent.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "restart-launchagent.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "run-daemon.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "uninstall-launchagent.sh"), 0o755);
  await writeFile(resolve(APP_CONTENTS, "Info.plist"), infoPlist());
}

async function buildInstaller() {
  await mkdir(dirname(PKG_OUTPUT), { recursive: true });
  await run("pkgbuild", ["--component", APP_BUNDLE, "--install-location", "/Applications", PKG_OUTPUT]);
}

const options = parseArgs(process.argv.slice(2));
await ensureBuild(options.skipBuild);
await stageBundle();
await buildInstaller();

console.log(`Built ${PKG_OUTPUT}`);
