#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

APP_PATH="dist/.macos-staging/ChillClaw.app"
DAEMON_ENTITLEMENTS="scripts/macos-daemon-entitlements.plist"
NODE_RUNTIME_ENTITLEMENTS="scripts/macos-node-runtime-entitlements.plist"
INSTALLER_PATH="dist/macos/ChillClaw-macOS.dmg"
CHECKSUM_PATH="dist/macos/ChillClaw-macOS.dmg.sha256.txt"

SKIP_BUILD=0
SKIP_RUNTIME_ARTIFACTS=0
SKIP_NOTARIZE=0

usage() {
  cat <<'EOF'
Build, sign, notarize, staple, and assess the ChillClaw macOS DMG for testing on another Mac.

Required environment:
  APP_IDENTITY              Developer ID Application identity name or SHA

Required unless --skip-notarize is used:
  APPLE_NOTARY_KEY_PATH     Path to the App Store Connect API key .p8 file
  APPLE_NOTARY_KEY_ID       App Store Connect API key id
  APPLE_NOTARY_ISSUER_ID    App Store Connect issuer id
  APPLE_TEAM_ID             Apple Developer Team ID

Usage:
  npm run build:mac-signed-installer
  npm run build:mac-signed-installer -- --skip-build
  npm run build:mac-signed-installer -- --skip-runtime-artifacts
  npm run build:mac-signed-installer -- --skip-notarize

Notes:
  --skip-build skips workspace rebuilds during app staging.
  --skip-runtime-artifacts reuses the current runtime-artifacts directory.
  --skip-notarize creates a signed but non-notarized DMG for local-only checks.
EOF
}

log() {
  printf '[ChillClaw signed macOS installer] %s\n' "$*"
}

fail() {
  printf '[ChillClaw signed macOS installer] error: %s\n' "$*" >&2
  exit 1
}

error_trap() {
  local line="$1"
  local command="$2"
  log "Command failed at line $line: $command"
}

trap 'error_trap $LINENO "$BASH_COMMAND"' ERR

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Set $name before running this script."
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "Required command not found: $name"
  fi
}

parse_notary_field() {
  local field="$1"
  node -e '
const field = process.argv[1];
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(input);
  const value = payload[field];
  if (value) {
    process.stdout.write(String(value));
  }
});
' "$field"
}

notary_key_path() {
  case "$APPLE_NOTARY_KEY_PATH" in
    "~/"*) printf '%s/%s\n' "$HOME" "${APPLE_NOTARY_KEY_PATH#"~/"}" ;;
    *) printf '%s\n' "$APPLE_NOTARY_KEY_PATH" ;;
  esac
}

is_node_runtime_executable() {
  case "$1" in
    "$APP_PATH"/Contents/Resources/app/runtime-artifacts/node/node-v*/bin/node) return 0 ;;
    *) return 1 ;;
  esac
}

log_environment_summary() {
  local machine_arch
  local npm_version
  local node_version
  machine_arch="$(uname -m)"
  npm_version="$(npm --version 2>/dev/null || printf 'unavailable')"
  node_version="$(node --version 2>/dev/null || printf 'unavailable')"

  log "Environment: macOS arch=$machine_arch node=$node_version npm=$npm_version skip_build=$SKIP_BUILD skip_runtime_artifacts=$SKIP_RUNTIME_ARTIFACTS skip_notarize=$SKIP_NOTARIZE"
  log "Paths: app=$APP_PATH installer=$INSTALLER_PATH checksum=$CHECKSUM_PATH"
}

log_artifact_summary() {
  local runtime_dir="$APP_PATH/Contents/Resources/app/runtime-artifacts"
  local daemon_bin="$APP_PATH/Contents/Resources/runtime/chillclaw-daemon"
  local native_bin="$APP_PATH/Contents/MacOS/ChillClaw"
  local executable_count

  if [[ ! -d "$APP_PATH" ]]; then
    fail "Staged app bundle is missing: $APP_PATH"
  fi

  if [[ ! -d "$runtime_dir" ]]; then
    fail "Staged runtime artifact directory is missing: $runtime_dir"
  fi

  executable_count="$(find "$runtime_dir" -type f -perm -111 | wc -l | tr -d '[:space:]')"
  log "Staged app bundle: $APP_PATH"
  log "Runtime artifact executable count: $executable_count"
  if [[ -x "$daemon_bin" ]]; then
    log "Daemon binary: $(file "$daemon_bin")"
  fi
  if [[ -x "$native_bin" ]]; then
    log "Native app binary: $(file "$native_bin")"
  fi
  while IFS= read -r -d '' NODE_BIN; do
    log "Packaged Node binary: $(file "$NODE_BIN")"
    log "Packaged Node version: $("$NODE_BIN" --version 2>/dev/null || printf 'unavailable')"
  done < <(find "$runtime_dir/node" -path '*/bin/node' -type f -perm -111 -print0 2>/dev/null || true)
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=1
      ;;
    --skip-runtime-artifacts)
      SKIP_RUNTIME_ARTIFACTS=1
      ;;
    --skip-notarize)
      SKIP_NOTARIZE=1
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

require_command codesign
require_command file
require_command find
require_command node
require_command npm
require_command security
require_command shasum

require_env APP_IDENTITY

if [[ "$SKIP_NOTARIZE" == "0" ]]; then
  require_env APPLE_NOTARY_KEY_PATH
  require_env APPLE_NOTARY_KEY_ID
  require_env APPLE_NOTARY_ISSUER_ID
  require_env APPLE_TEAM_ID
  require_command spctl
  require_command xcrun

  NOTARY_KEY_PATH="$(notary_key_path)"
  if [[ ! -f "$NOTARY_KEY_PATH" ]]; then
    fail "APPLE_NOTARY_KEY_PATH does not point to a readable file: $NOTARY_KEY_PATH"
  fi
fi

if ! security find-identity -v -p codesigning | grep -F -- "$APP_IDENTITY" >/dev/null; then
  fail "APP_IDENTITY was not found in the current keychain: $APP_IDENTITY"
fi

if [[ ! -f "$NODE_RUNTIME_ENTITLEMENTS" ]]; then
  fail "Node runtime entitlements file is missing: $NODE_RUNTIME_ENTITLEMENTS"
fi

log_environment_summary

if [[ "$SKIP_RUNTIME_ARTIFACTS" == "0" ]]; then
  log "Preparing bundled CLI runtime artifacts"
  npm run prepare:runtime-artifacts
else
  log "Reusing existing runtime-artifacts directory"
fi

log "Staging ChillClaw.app"
if [[ "$SKIP_BUILD" == "1" ]]; then
  npm run build:mac-installer -- --skip-build --stage-only
else
  npm run build:mac-installer -- --stage-only
fi

log_artifact_summary

log "Signing packaged runtime Mach-O files"
SIGNED_RUNTIME_COUNT=0
while IFS= read -r -d '' RUNTIME_EXECUTABLE; do
  if file "$RUNTIME_EXECUTABLE" | grep -q 'Mach-O'; then
    log "Signing runtime Mach-O file: $RUNTIME_EXECUTABLE ($(file "$RUNTIME_EXECUTABLE"))"
    if is_node_runtime_executable "$RUNTIME_EXECUTABLE"; then
      codesign --force --sign "$APP_IDENTITY" --options runtime --timestamp --entitlements "$NODE_RUNTIME_ENTITLEMENTS" "$RUNTIME_EXECUTABLE"
    else
      codesign --force --sign "$APP_IDENTITY" --options runtime --timestamp "$RUNTIME_EXECUTABLE"
    fi
    SIGNED_RUNTIME_COUNT=$((SIGNED_RUNTIME_COUNT + 1))
  fi
done < <(find "$APP_PATH/Contents/Resources/app/runtime-artifacts" -type f -print0)
log "Signed $SIGNED_RUNTIME_COUNT packaged runtime Mach-O file(s)"

log "Signing daemon, native executable, and app bundle"
codesign --force --sign "$APP_IDENTITY" --options runtime --timestamp --entitlements "$DAEMON_ENTITLEMENTS" "$APP_PATH/Contents/Resources/runtime/chillclaw-daemon"
codesign --force --sign "$APP_IDENTITY" --options runtime --timestamp "$APP_PATH/Contents/MacOS/ChillClaw"
codesign --force --sign "$APP_IDENTITY" --options runtime --timestamp "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

log "Building signed DMG from signed app"
rm -f "$INSTALLER_PATH" "$CHECKSUM_PATH"
npm run build:mac-installer -- --skip-build --dmg-only
codesign --force --sign "$APP_IDENTITY" --timestamp "$INSTALLER_PATH"
codesign --verify --verbose=2 "$INSTALLER_PATH"

if [[ "$SKIP_NOTARIZE" == "0" ]]; then
  log "Submitting DMG to Apple notary service"
  NOTARY_RESULT="$(xcrun notarytool submit "$INSTALLER_PATH" \
    --key "$NOTARY_KEY_PATH" \
    --key-id "$APPLE_NOTARY_KEY_ID" \
    --issuer "$APPLE_NOTARY_ISSUER_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --wait \
    --output-format json)"
  printf '%s\n' "$NOTARY_RESULT"

  NOTARY_STATUS="$(printf '%s\n' "$NOTARY_RESULT" | parse_notary_field status)"
  NOTARY_SUBMISSION_ID="$(printf '%s\n' "$NOTARY_RESULT" | parse_notary_field id)"
  if [[ "$NOTARY_STATUS" != "Accepted" ]]; then
    if [[ -n "$NOTARY_SUBMISSION_ID" ]]; then
      log "Fetching Apple notary log for rejected submission $NOTARY_SUBMISSION_ID"
      xcrun notarytool log "$NOTARY_SUBMISSION_ID" \
        --key "$NOTARY_KEY_PATH" \
        --key-id "$APPLE_NOTARY_KEY_ID" \
        --issuer "$APPLE_NOTARY_ISSUER_ID" \
        --team-id "$APPLE_TEAM_ID" || true
    fi
    fail "Apple notarization finished with status ${NOTARY_STATUS:-unknown}; not stapling invalid DMG."
  fi

  log "Stapling notary ticket and assessing Gatekeeper"
  xcrun stapler staple "$INSTALLER_PATH"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$INSTALLER_PATH"
else
  log "Skipping notarization; this DMG is signed but not suitable for Gatekeeper testing on another Mac."
fi

log "Writing checksum"
shasum -a 256 "$INSTALLER_PATH" > "$CHECKSUM_PATH"
test -s "$INSTALLER_PATH"
test -s "$CHECKSUM_PATH"
log "Installer size: $(stat -f%z "$INSTALLER_PATH") bytes"

log "Built $INSTALLER_PATH"
log "Checksum written to $CHECKSUM_PATH"
