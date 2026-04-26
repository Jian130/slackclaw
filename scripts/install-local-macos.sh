#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

APP_NAME="ChillClaw"
STAGED_APP_PATH="dist/.macos-staging/ChillClaw.app"
DMG_PATH="dist/macos/ChillClaw-macOS.dmg"
RUNTIME_ARTIFACTS_DIR="runtime-artifacts"
PREPARE_RUNTIME_SCRIPT="scripts/prepare-runtime-artifacts.mjs"
DEFAULT_INSTALL_DIR="/Applications"
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
OPEN_APP=1
REFRESH_LAUNCH_AGENT=1
SKIP_BUILD=0
SKIP_RUNTIME_ARTIFACTS=0
LAUNCH_AGENT_LABEL="ai.chillclaw.daemon"

usage() {
  cat <<'EOF'
Build and install an unsigned local ChillClaw macOS app on this Mac.

Usage:
  npm run install:mac-local
  npm run install:mac-local -- --user
  npm run install:mac-local -- --install-dir "$HOME/Applications"
  npm run install:mac-local -- --skip-build
  npm run install:mac-local -- --skip-runtime-artifacts
  npm run install:mac-local -- --no-open
  npm run install:mac-local -- --no-launch-agent

Notes:
  This script does not sign, notarize, or request administrator elevation.
  It installs the app bundle only; it does not delete ChillClaw user data.
  Use this for same-machine local testing, not distribution to another Mac.
EOF
}

log() {
  printf '[ChillClaw local macOS install] %s\n' "$*"
}

fail() {
  printf '[ChillClaw local macOS install] error: %s\n' "$*" >&2
  exit 1
}

error_trap() {
  local line="$1"
  local command="$2"
  log "Command failed at line $line: $command"
}

trap 'error_trap $LINENO "$BASH_COMMAND"' ERR

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "Required command not found: $name"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        fail "--install-dir requires a path."
      fi
      INSTALL_DIR="$2"
      shift
      ;;
    --user)
      INSTALL_DIR="$HOME/Applications"
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    --skip-runtime-artifacts)
      SKIP_RUNTIME_ARTIFACTS=1
      ;;
    --no-open)
      OPEN_APP=0
      ;;
    --no-launch-agent)
      REFRESH_LAUNCH_AGENT=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This script must run on macOS."
fi

require_command ditto
require_command launchctl
require_command node
require_command npm

if [[ "$OPEN_APP" == "1" ]]; then
  require_command open
fi

cd "$ROOT_DIR"

log "Environment: install_dir=$INSTALL_DIR skip_build=$SKIP_BUILD skip_runtime_artifacts=$SKIP_RUNTIME_ARTIFACTS refresh_launch_agent=$REFRESH_LAUNCH_AGENT open_app=$OPEN_APP"

if [[ "$SKIP_RUNTIME_ARTIFACTS" == "0" ]]; then
  if [[ -f "$PREPARE_RUNTIME_SCRIPT" ]]; then
    log "Preparing bundled CLI runtime artifacts"
    npm run prepare:runtime-artifacts
  elif [[ -d "$RUNTIME_ARTIFACTS_DIR" ]]; then
    log "Runtime prepare helper is missing; reusing existing runtime-artifacts directory"
  else
    fail "Runtime prepare helper is missing and the runtime-artifacts directory is not present. Restore $PREPARE_RUNTIME_SCRIPT or rerun with --skip-runtime-artifacts after preparing runtime artifacts."
  fi
else
  log "Reusing existing runtime-artifacts directory"
fi

log "Building unsigned local macOS app and DMG"
if [[ "$SKIP_BUILD" == "1" ]]; then
  npm run build:mac-installer -- --skip-build
else
  npm run build:mac-installer
fi

if [[ ! -d "$STAGED_APP_PATH" ]]; then
  fail "Staged app bundle is missing: $STAGED_APP_PATH"
fi

mkdir -p "$INSTALL_DIR"
if [[ ! -w "$INSTALL_DIR" ]]; then
  fail "$INSTALL_DIR is not writable. Choose --user, pass --install-dir, or change the directory permissions."
fi

INSTALLED_APP_PATH="$INSTALL_DIR/$APP_NAME.app"
LAUNCH_AGENT_INSTALL_SCRIPT="$INSTALLED_APP_PATH/Contents/Resources/app/scripts/install-launchagent.sh"

log "Stopping existing per-user LaunchAgent if it is loaded"
/bin/launchctl bootout "gui/$UID/$LAUNCH_AGENT_LABEL" >/dev/null 2>&1 || true

if [[ -e "$INSTALLED_APP_PATH" ]]; then
  log "Replacing existing app bundle at $INSTALLED_APP_PATH"
  rm -rf "$INSTALLED_APP_PATH"
fi

log "Installing $STAGED_APP_PATH to $INSTALLED_APP_PATH"
ditto "$STAGED_APP_PATH" "$INSTALLED_APP_PATH"

if command -v xattr >/dev/null 2>&1; then
  /usr/bin/xattr -dr com.apple.quarantine "$INSTALLED_APP_PATH" >/dev/null 2>&1 || true
fi

if [[ "$REFRESH_LAUNCH_AGENT" == "1" ]]; then
  if [[ ! -x "$LAUNCH_AGENT_INSTALL_SCRIPT" ]]; then
    fail "LaunchAgent installer is missing or not executable: $LAUNCH_AGENT_INSTALL_SCRIPT"
  fi

  log "Installing or refreshing the per-user LaunchAgent"
  "$LAUNCH_AGENT_INSTALL_SCRIPT"
else
  log "Skipping LaunchAgent refresh"
fi

if [[ "$OPEN_APP" == "1" ]]; then
  log "Opening $INSTALLED_APP_PATH"
  open "$INSTALLED_APP_PATH"
fi

log "Installed unsigned local app at $INSTALLED_APP_PATH"
log "Built local DMG at $DMG_PATH"
