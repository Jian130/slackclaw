#!/usr/bin/env node

import { spawn } from "node:child_process";
import { chmod, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, "dist/macos");
const APP_NAME = "SlackClaw";
const APP_BUNDLE = resolve(DIST_DIR, `${APP_NAME}.app`);
const APP_CONTENTS = resolve(APP_BUNDLE, "Contents");
const APP_MACOS = resolve(APP_CONTENTS, "MacOS");
const APP_RESOURCES = resolve(APP_CONTENTS, "Resources");
const APP_RUNTIME = resolve(APP_RESOURCES, "runtime");
const APP_RUNTIME_ROOT = resolve(APP_RESOURCES, "app");
const APP_DAEMON = resolve(APP_RUNTIME_ROOT, "daemon");
const APP_UI = resolve(APP_RUNTIME_ROOT, "ui");
const APP_SCRIPTS = resolve(APP_RUNTIME_ROOT, "scripts");
const APP_NODE_MODULES = resolve(APP_RUNTIME_ROOT, "node_modules/@slackclaw/contracts");
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

async function ensureBuild(skipBuild) {
  if (!skipBuild) {
    await run("npm", ["run", "build"]);
  }
}

function launcherScript() {
  return `#!/bin/sh
set -eu

APP_ROOT="$(cd "$(dirname "$0")/../Resources" && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/SlackClaw"
DATA_DIR="$APP_SUPPORT/data"
LOG_DIR="$APP_SUPPORT/logs"
NODE_BIN="$APP_ROOT/runtime/node"
DAEMON_ENTRY="$APP_ROOT/app/daemon/index.js"
UI_URL="http://127.0.0.1:4545/"
HEALTH_URL="http://127.0.0.1:4545/api/overview"

mkdir -p "$DATA_DIR" "$LOG_DIR"

export SLACKCLAW_APP_ROOT="$APP_ROOT"
export SLACKCLAW_PORT="4545"
export SLACKCLAW_DATA_DIR="$DATA_DIR"
export SLACKCLAW_STATIC_DIR="$APP_ROOT/app/ui"
export SLACKCLAW_OPENCLAW_BOOTSTRAP_SCRIPT="$APP_ROOT/app/scripts/bootstrap-openclaw.mjs"
export SLACKCLAW_LAUNCHAGENT_LABEL="${LAUNCH_AGENT_LABEL}"

if ! /usr/bin/curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1; then
  "$APP_ROOT/app/scripts/install-launchagent.sh" >/dev/null 2>&1 || true
  ATTEMPT=0
  until /usr/bin/curl --silent --fail "$HEALTH_URL" >/dev/null 2>&1 || [ "$ATTEMPT" -ge 20 ]; do
    ATTEMPT=$((ATTEMPT + 1))
    /bin/sleep 1
  done
fi

/usr/bin/open "$UI_URL"
`;
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
NODE_BIN="$APP_ROOT/runtime/node"
DAEMON_ENTRY="$APP_ROOT/app/daemon/index.js"
STATIC_DIR="$APP_ROOT/app/ui"
BOOTSTRAP_SCRIPT="$APP_ROOT/app/scripts/bootstrap-openclaw.mjs"

mkdir -p "$DATA_DIR" "$LOG_DIR" "$LAUNCH_AGENTS_DIR"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>exec -a slackclaw "$1" "$2"</string>
      <string>_</string>
      <string>$NODE_BIN</string>
      <string>$DAEMON_ENTRY</string>
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
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

async function stageBundle() {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(APP_MACOS, { recursive: true });
  await mkdir(APP_RUNTIME, { recursive: true });
  await mkdir(APP_DAEMON, { recursive: true });
  await mkdir(APP_UI, { recursive: true });
  await mkdir(APP_SCRIPTS, { recursive: true });
  await mkdir(resolve(APP_NODE_MODULES, "dist"), { recursive: true });

  await copyFile(process.execPath, resolve(APP_RUNTIME, "node"));
  await chmod(resolve(APP_RUNTIME, "node"), 0o755);

  await cp(resolve(ROOT, "apps/daemon/dist"), APP_DAEMON, { recursive: true });
  await cp(resolve(ROOT, "apps/desktop-ui/dist"), APP_UI, { recursive: true });
  await copyFile(resolve(ROOT, "scripts/bootstrap-openclaw.mjs"), resolve(APP_SCRIPTS, "bootstrap-openclaw.mjs"));
  await copyFile(resolve(ROOT, "packages/contracts/package.json"), resolve(APP_NODE_MODULES, "package.json"));
  await cp(resolve(ROOT, "packages/contracts/dist"), resolve(APP_NODE_MODULES, "dist"), { recursive: true });

  await writeFile(
    resolve(APP_RUNTIME_ROOT, "package.json"),
    JSON.stringify(
      {
        name: "slackclaw-runtime",
        private: true,
        type: "module"
      },
      null,
      2
    )
  );

  await writeFile(resolve(APP_SCRIPTS, "install-launchagent.sh"), installLaunchAgentScript());
  await writeFile(resolve(APP_SCRIPTS, "restart-launchagent.sh"), restartLaunchAgentScript());
  await writeFile(resolve(APP_SCRIPTS, "uninstall-launchagent.sh"), uninstallLaunchAgentScript());
  await chmod(resolve(APP_SCRIPTS, "install-launchagent.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "restart-launchagent.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "uninstall-launchagent.sh"), 0o755);
  await writeFile(resolve(APP_MACOS, "SlackClaw"), launcherScript());
  await chmod(resolve(APP_MACOS, "SlackClaw"), 0o755);
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
