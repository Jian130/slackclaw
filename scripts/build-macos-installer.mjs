#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, copyFile, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";

import { writeScriptLogLine } from "./logging.mjs";

const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, "dist/macos");
const STAGING_DIR = resolve(ROOT, "dist/.macos-staging");
const BUILD_DIR = resolve(STAGING_DIR, ".build");
const DMG_STAGING_DIR = resolve(STAGING_DIR, "dmg");
const APP_NAME = "ChillClaw";
const APP_BUNDLE = resolve(STAGING_DIR, `${APP_NAME}.app`);
const APP_CONTENTS = resolve(APP_BUNDLE, "Contents");
const APP_MACOS = resolve(APP_CONTENTS, "MacOS");
const APP_RESOURCES = resolve(APP_CONTENTS, "Resources");
const APP_RUNTIME = resolve(APP_RESOURCES, "runtime");
const APP_RUNTIME_ROOT = resolve(APP_RESOURCES, "app");
const APP_UI = resolve(APP_RUNTIME_ROOT, "ui");
const APP_SCRIPTS = resolve(APP_RUNTIME_ROOT, "scripts");
const APP_RUNTIME_ARTIFACTS = resolve(APP_RUNTIME_ROOT, "runtime-artifacts");
const PACKAGED_DAEMON_BUNDLE = resolve(BUILD_DIR, "chillclaw-daemon.cjs");
const PACKAGED_DAEMON_BINARY = resolve(APP_RUNTIME, "chillclaw-daemon");
const MACOS_NATIVE_PACKAGE_DIR = resolve(ROOT, "apps/macos-native");
const NATIVE_EXECUTABLE_NAME = APP_NAME;
const APP_NATIVE_EXECUTABLE = resolve(APP_MACOS, APP_NAME);
const APP_ICON_FILENAME = "ChillClawAppIcon.icns";
const APP_ICON_PNG_FILENAME = "ChillClawAppIcon.png";
const APP_BRAND_LOGO_FILENAME = "ChillClawBrandLogo.png";
const APP_ICON_SOURCE = resolve(MACOS_NATIVE_PACKAGE_DIR, "Sources/ChillClawNative/Resources", APP_ICON_FILENAME);
const APP_ICON_PNG_SOURCE = resolve(MACOS_NATIVE_PACKAGE_DIR, "Sources/ChillClawNative/Resources", APP_ICON_PNG_FILENAME);
const APP_BRAND_LOGO_SOURCE = resolve(MACOS_NATIVE_PACKAGE_DIR, "Sources/ChillClawNative/Resources", APP_BRAND_LOGO_FILENAME);
const RUNTIME_MANIFEST_SOURCE = resolve(ROOT, "runtime-manifest.lock.json");
const RUNTIME_ARTIFACTS_SOURCE = resolve(ROOT, "runtime-artifacts");
const DMG_OUTPUT = resolve(DIST_DIR, `${APP_NAME}-macOS.dmg`);
const LEGACY_PKG_OUTPUT = resolve(DIST_DIR, `${APP_NAME}-macOS.pkg`);
const INSTALLER_ICON_PNG = resolve(BUILD_DIR, "installer-icon.png");
const INSTALLER_ICON_RESOURCE = resolve(BUILD_DIR, "installer-icon.rsrc");
const LAUNCH_AGENT_LABEL = "ai.chillclaw.daemon";
const SCRIPT_LABEL = "ChillClaw installer";
const PACKAGED_APP_BUILD_WORKSPACES = ["@chillclaw/contracts", "@chillclaw/daemon", "@chillclaw/desktop-ui"];

async function readProductVersion() {
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8"));
  const version = packageJson?.version;
  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error("Root package.json is missing a valid version string.");
  }

  return version.trim();
}

const APP_VERSION = await readProductVersion();

function parseArgs(argv) {
  const options = {
    skipBuild: argv.includes("--skip-build"),
    stageOnly: argv.includes("--stage-only"),
    dmgOnly: argv.includes("--dmg-only")
  };

  if (options.stageOnly && options.dmgOnly) {
    throw new Error("Use either --stage-only or --dmg-only, not both.");
  }

  return options;
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

function capture(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "inherit"],
      env: {
        ...process.env,
        ...env,
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
    for (const workspace of PACKAGED_APP_BUILD_WORKSPACES) {
      await run("npm", ["run", "build", "--workspace", workspace]);
    }
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
  await run("node", [
    "./scripts/swift-package.mjs",
    "build",
    "--package-path",
    MACOS_NATIVE_PACKAGE_DIR,
    "-c",
    "release",
    "--product",
    NATIVE_EXECUTABLE_NAME
  ]);

  const binDir = await capture("node", [
    "./scripts/swift-package.mjs",
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
  await copyNativeResourceBundles(binDir);
}

async function copyNativeResourceBundles(binDir) {
  const entries = await readdir(binDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".bundle")) {
      continue;
    }

    await cp(resolve(binDir, entry.name), resolve(APP_RESOURCES, entry.name), { recursive: true });
  }
}

function installLaunchAgentScript() {
  return `#!/bin/sh
set -eu

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/ChillClaw"
DATA_DIR="$APP_SUPPORT/data"
LOG_DIR="$APP_SUPPORT/logs"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LABEL="${LAUNCH_AGENT_LABEL}"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
DAEMON_BIN="$APP_ROOT/runtime/chillclaw-daemon"
STATIC_DIR="$APP_ROOT/app/ui"
BOOTSTRAP_SCRIPT="$APP_ROOT/app/scripts/bootstrap-openclaw.mjs"
RUNTIME_BUNDLE_DIR="$APP_ROOT/app/runtime-artifacts"
RUNTIME_MANIFEST_PATH="$RUNTIME_BUNDLE_DIR/runtime-manifest.lock.json"
RUNTIME_UPDATE_FEED_URL="\${CHILLCLAW_RUNTIME_UPDATE_FEED_URL:-}"

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
      <key>CHILLCLAW_APP_ROOT</key>
      <string>$APP_ROOT</string>
      <key>CHILLCLAW_PORT</key>
      <string>4545</string>
      <key>CHILLCLAW_APP_VERSION</key>
      <string>${APP_VERSION}</string>
      <key>CHILLCLAW_DATA_DIR</key>
      <string>$DATA_DIR</string>
      <key>CHILLCLAW_STATIC_DIR</key>
      <string>$STATIC_DIR</string>
      <key>CHILLCLAW_OPENCLAW_BOOTSTRAP_SCRIPT</key>
      <string>$BOOTSTRAP_SCRIPT</string>
      <key>CHILLCLAW_RUNTIME_BUNDLE_DIR</key>
      <string>$RUNTIME_BUNDLE_DIR</string>
      <key>CHILLCLAW_RUNTIME_MANIFEST_PATH</key>
      <string>$RUNTIME_MANIFEST_PATH</string>
      <key>CHILLCLAW_RUNTIME_UPDATE_FEED_URL</key>
      <string>$RUNTIME_UPDATE_FEED_URL</string>
      <key>CHILLCLAW_LAUNCHAGENT_LABEL</key>
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
APP_SUPPORT="$HOME/Library/Application Support/ChillClaw"
LOG_DIR="$APP_SUPPORT/logs"
DAEMON_BIN="$APP_ROOT/runtime/chillclaw-daemon"
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
  <string>ChillClaw</string>
  <key>CFBundleExecutable</key>
  <string>ChillClaw</string>
  <key>CFBundleIdentifier</key>
  <string>ai.chillclaw.desktop</string>
  <key>CFBundleIconFile</key>
  <string>ChillClawAppIcon.icns</string>
  <key>CFBundleIconName</key>
  <string>ChillClawAppIcon</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>ChillClaw</string>
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
  <key>NSUserNotificationUsageDescription</key>
  <string>ChillClaw needs notification permission to show alerts for agent activity.</string>
  <key>NSScreenCaptureDescription</key>
  <string>ChillClaw captures the screen when the agent needs screenshots for context.</string>
  <key>NSCameraUsageDescription</key>
  <string>ChillClaw can capture photos or short video clips when requested by the agent.</string>
  <key>NSLocationUsageDescription</key>
  <string>ChillClaw can share your location when requested by the agent.</string>
  <key>NSLocationWhenInUseUsageDescription</key>
  <string>ChillClaw can share your location when requested by the agent.</string>
  <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
  <string>ChillClaw can share your location when requested by the agent.</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>ChillClaw needs microphone access for Voice Wake and audio capture.</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>ChillClaw uses on-device speech recognition to detect your Voice Wake trigger phrase.</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>ChillClaw needs Automation (AppleScript) permission to drive Terminal and other apps for agent actions.</string>
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
  await mkdir(APP_RUNTIME_ARTIFACTS, { recursive: true });

  await buildStandaloneDaemon();
  await buildNativeClient();
  await copyFile(APP_ICON_SOURCE, resolve(APP_RESOURCES, APP_ICON_FILENAME));
  await copyFile(APP_ICON_PNG_SOURCE, resolve(APP_RESOURCES, APP_ICON_PNG_FILENAME));
  await copyFile(APP_BRAND_LOGO_SOURCE, resolve(APP_RESOURCES, APP_BRAND_LOGO_FILENAME));
  await cp(resolve(ROOT, "apps/desktop-ui/dist"), APP_UI, { recursive: true });
  await copyFile(resolve(ROOT, "scripts/bootstrap-openclaw.mjs"), resolve(APP_SCRIPTS, "bootstrap-openclaw.mjs"));
  await copyRuntimeArtifacts();

  await writeFile(resolve(APP_SCRIPTS, "install-launchagent.sh"), installLaunchAgentScript());
  await writeFile(resolve(APP_SCRIPTS, "restart-launchagent.sh"), restartLaunchAgentScript());
  await writeFile(resolve(APP_SCRIPTS, "run-daemon.sh"), runDaemonScript());
  await writeFile(resolve(APP_SCRIPTS, "uninstall-launchagent.sh"), uninstallLaunchAgentScript());
  await chmod(resolve(APP_SCRIPTS, "install-launchagent.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "restart-launchagent.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "run-daemon.sh"), 0o755);
  await chmod(resolve(APP_SCRIPTS, "uninstall-launchagent.sh"), 0o755);
  await writeFile(resolve(APP_CONTENTS, "Info.plist"), infoPlist());
  await writeFile(resolve(APP_CONTENTS, "PkgInfo"), "APPL????");
}

async function copyRuntimeArtifacts() {
  try {
    await cp(RUNTIME_ARTIFACTS_SOURCE, APP_RUNTIME_ARTIFACTS, { recursive: true, verbatimSymlinks: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await copyFile(RUNTIME_MANIFEST_SOURCE, resolve(APP_RUNTIME_ARTIFACTS, "runtime-manifest.lock.json"));
  await assertNoInstallerRuntimePayloads(APP_RUNTIME_ARTIFACTS);
  await assertPackagedCliRuntimeArtifacts();
}

async function assertPackagedCliRuntimeArtifacts() {
  const manifest = JSON.parse(await readFile(resolve(APP_RUNTIME_ARTIFACTS, "runtime-manifest.lock.json"), "utf8"));
  const node = runtimeResourceFor(manifest, "node-npm-runtime");
  const openclaw = runtimeResourceFor(manifest, "openclaw-runtime");
  const ollama = runtimeResourceFor(manifest, "ollama-runtime");
  const ollamaArtifact = bundledArtifactFor(ollama, "file");
  const openclawArtifact = bundledArtifactFor(openclaw, "directory");
  bundledArtifactFor(node, "directory");
  const nodeDir = resolve(APP_RUNTIME_ARTIFACTS, "node", currentNodeDistName(node.version));
  const openclawBin = resolve(APP_RUNTIME_ARTIFACTS, openclawArtifact.path, "node_modules", ".bin", "openclaw");
  const ollamaPath = resolve(APP_RUNTIME_ARTIFACTS, ollamaArtifact.path);

  await requireExecutablePath(resolve(nodeDir, "bin/node"), "Packaged Node.js runtime node is not executable.");
  await requireExecutablePath(resolve(nodeDir, "bin/npm"), "Packaged Node.js runtime npm is not executable.");
  await runPackagedRuntimeCommand(
    resolve(nodeDir, "bin", "node"),
    ["--version"],
    "Packaged Node.js runtime node cannot run.",
    packagedRuntimeEnv(nodeDir)
  );
  await runPackagedRuntimeCommand(
    resolve(nodeDir, "bin", "npm"),
    ["--version"],
    "Packaged Node.js runtime npm cannot run.",
    packagedRuntimeEnv(nodeDir)
  );
  await runPackagedRuntimeCommand(
    resolve(nodeDir, "bin", "node"),
    [resolve(nodeDir, "lib", "node_modules", "npm", "bin", "npm-cli.js"), "--version"],
    "Packaged Node.js runtime npm CLI cannot run through node.",
    packagedRuntimeEnv(nodeDir)
  );
  await requireExecutablePath(openclawBin, "Packaged OpenClaw runtime CLI is not executable.");
  await runPackagedRuntimeCommand(
    openclawBin,
    ["--version"],
    "Packaged OpenClaw runtime CLI cannot run.",
    packagedRuntimeEnv(nodeDir)
  );
  await requireExecutablePath(ollamaPath, "Packaged Ollama runtime is missing the runnable ollama CLI binary.");
  await runPackagedRuntimeCommand(
    ollamaPath,
    ["--version"],
    "Packaged Ollama runtime CLI cannot run.",
    packagedRuntimeEnv(nodeDir)
  );
}

function currentNodeDistName(version) {
  const arch = process.arch === "x64" ? "x64" : "arm64";
  return `node-v${version}-darwin-${arch}`;
}

function packagedRuntimeEnv(nodeDir) {
  const runtimeBin = resolve(nodeDir, "bin");
  const pathEntries = [
    runtimeBin,
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ];

  return {
    PATH: [...new Set(pathEntries)].join(delimiter)
  };
}

async function runPackagedRuntimeCommand(command, args, message, env) {
  try {
    await capture(command, args, env);
  } catch (error) {
    throw new Error(`${message} ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runtimeResourceFor(manifest, id) {
  const resource = manifest.resources?.find((candidate) => candidate.id === id);
  if (!resource) {
    throw new Error(`Runtime manifest is missing ${id}.`);
  }
  return resource;
}

function bundledArtifactFor(resource, format) {
  const artifact = resource.artifacts?.find((candidate) => candidate.source === "bundled");
  if (!artifact) {
    throw new Error(`${resource.id} is missing a bundled runtime artifact.`);
  }
  if (artifact.format !== format) {
    throw new Error(`${resource.id} must bundle a ${format} runtime artifact, got ${artifact.format}.`);
  }
  if (!artifact.path) {
    throw new Error(`${resource.id} bundled runtime artifact is missing a path.`);
  }
  return artifact;
}

async function assertNoInstallerRuntimePayloads(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = resolve(dir, entry.name);
    if (entry.name.endsWith(".app") || entry.name.endsWith(".dmg") || entry.name.endsWith(".pkg")) {
      throw new Error(`Runtime artifacts must be runnable CLI payloads, not installer/UI payloads: ${childPath}`);
    }
    if (entry.isDirectory()) {
      await assertNoInstallerRuntimePayloads(childPath);
    }
  }
}

async function requireExecutablePath(path, message) {
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new Error(message);
  }
}

async function buildInstaller() {
  await mkdir(dirname(DMG_OUTPUT), { recursive: true });
  await rm(LEGACY_PKG_OUTPUT, { force: true });
  await stageDiskImageContents();
  await run("hdiutil", ["create", "-volname", APP_NAME, "-srcfolder", DMG_STAGING_DIR, "-ov", "-format", "UDZO", DMG_OUTPUT]);
  await applyInstallerFileIcon(DMG_OUTPUT);
}

async function assertStagedAppBundleExists() {
  try {
    await access(APP_BUNDLE);
  } catch {
    throw new Error("No staged ChillClaw.app found. Run `npm run build:mac-installer -- --stage-only` before `--dmg-only`.");
  }
}

async function stageDiskImageContents() {
  await rm(DMG_STAGING_DIR, { recursive: true, force: true });
  await mkdir(DMG_STAGING_DIR, { recursive: true });
  await cp(APP_BUNDLE, resolve(DMG_STAGING_DIR, `${APP_NAME}.app`), { recursive: true, verbatimSymlinks: true });
  await symlink("/Applications", resolve(DMG_STAGING_DIR, "Applications"));
}

async function applyInstallerFileIcon(installerPath) {
  await copyFile(APP_ICON_PNG_SOURCE, INSTALLER_ICON_PNG);
  await run("sips", ["-i", INSTALLER_ICON_PNG]);

  const iconResource = await capture("DeRez", ["-only", "icns", INSTALLER_ICON_PNG]);
  await writeFile(INSTALLER_ICON_RESOURCE, `${iconResource}\n`);

  await run("Rez", ["-append", INSTALLER_ICON_RESOURCE, "-o", installerPath]);
  await run("SetFile", ["-a", "C", installerPath]);
}

function warnAboutLocalDistributionReadiness() {
  writeScriptLogLine({
    label: SCRIPT_LABEL,
    scope: "build-macos-installer.distribution",
    stream: "stderr",
    message:
      `Built ${DMG_OUTPUT} for local smoke testing only. ` +
      "Gatekeeper may report ChillClaw as damaged if this unsigned local DMG is shared with another Mac. " +
      "Use the signed and notarized GitHub release DMG for other computers."
  });
}

const options = parseArgs(process.argv.slice(2));

if (!options.dmgOnly) {
  await ensureBuild(options.skipBuild);
  await stageBundle();
}

if (!options.stageOnly) {
  if (options.dmgOnly) {
    await assertStagedAppBundleExists();
  }

  await buildInstaller();
}

if (!options.stageOnly && !options.dmgOnly) {
  warnAboutLocalDistributionReadiness();
}

writeScriptLogLine({
  label: SCRIPT_LABEL,
  scope: "build-macos-installer.main",
  message: options.stageOnly ? `Staged ${APP_BUNDLE}` : `Built ${DMG_OUTPUT}`
});
