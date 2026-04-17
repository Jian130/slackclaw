import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MACOS_DMG_NAME = "ChillClaw-macOS.dmg";
const MACOS_DMG_CHECKSUM_NAME = "ChillClaw-macOS.dmg.sha256.txt";

async function readRepoFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("macOS release workflow publishes the same DMG asset used by website and app updates", async () => {
  const [workflow, websiteLinks, appUpdateService] = await Promise.all([
    readRepoFile(".github/workflows/macos-release.yml"),
    readRepoFile("apps/website/src/links.ts"),
    readRepoFile("apps/daemon/src/services/app-update-service.ts")
  ]);

  assert.match(workflow, new RegExp(`INSTALLER_PATH:\\s*dist/macos/${MACOS_DMG_NAME.replaceAll(".", "\\.")}`));
  assert.match(workflow, new RegExp(`CHECKSUM_PATH:\\s*dist/macos/${MACOS_DMG_CHECKSUM_NAME.replaceAll(".", "\\.")}`));
  assert.doesNotMatch(workflow, /ChillClaw-macOS\.pkg/);
  assert.match(websiteLinks, new RegExp(`/releases/latest/download/${MACOS_DMG_NAME.replaceAll(".", "\\.")}`));
  assert.match(appUpdateService, new RegExp(`MACOS_INSTALLER_NAME = "${MACOS_DMG_NAME.replaceAll(".", "\\.")}"`));
});

test("macOS release workflow signs the staged app before building and notarizing the DMG", async () => {
  const workflow = await readRepoFile(".github/workflows/macos-release.yml");

  const stageIndex = workflow.indexOf("npm run build:mac-installer -- --skip-build --stage-only");
  const prepareRuntimeIndex = workflow.indexOf("npm run prepare:runtime-artifacts");
  const signIndex = workflow.indexOf("name: Sign ChillClaw.app");
  const dmgIndex = workflow.indexOf("npm run build:mac-installer -- --skip-build --dmg-only");
  const notarizeIndex = workflow.indexOf("name: Notarize and staple disk image");

  assert.notEqual(stageIndex, -1);
  assert.notEqual(prepareRuntimeIndex, -1);
  assert.notEqual(signIndex, -1);
  assert.notEqual(dmgIndex, -1);
  assert.notEqual(notarizeIndex, -1);
  assert.ok(prepareRuntimeIndex < stageIndex);
  assert.ok(stageIndex < signIndex);
  assert.ok(signIndex < dmgIndex);
  assert.ok(dmgIndex < notarizeIndex);
});

test("CI macOS installer smoke prepares runtime artifacts before packaging", async () => {
  const workflow = await readRepoFile(".github/workflows/ci.yml");

  const smokeIndex = workflow.indexOf("smoke-macos-installer:");
  const prepareRuntimeIndex = workflow.indexOf("npm run prepare:runtime-artifacts", smokeIndex);
  const buildIndex = workflow.indexOf("npm run build:mac-installer", smokeIndex);

  assert.notEqual(smokeIndex, -1);
  assert.notEqual(prepareRuntimeIndex, -1);
  assert.notEqual(buildIndex, -1);
  assert.ok(prepareRuntimeIndex < buildIndex);
});

test("macOS release workflow waits for notarization before Gatekeeper assessment", async () => {
  const workflow = await readRepoFile(".github/workflows/macos-release.yml");

  assert.doesNotMatch(workflow, /spctl --assess .*"\$APP_PATH"/);
  assert.doesNotMatch(workflow, /\n(?:const|let|process\.)/);
  assert.match(workflow, /xcrun notarytool submit "\$INSTALLER_PATH"[\s\S]*--output-format json/);
  assert.match(workflow, /parse_notary_field status/);
  assert.match(workflow, /xcrun notarytool log "\$NOTARY_SUBMISSION_ID"/);
  assert.match(workflow, /not stapling invalid DMG/);

  const stapleIndex = workflow.indexOf('xcrun stapler staple "$INSTALLER_PATH"');
  const installerAssessIndex = workflow.indexOf(
    'spctl --assess --type open --context context:primary-signature --verbose=2 "$INSTALLER_PATH"'
  );

  assert.notEqual(stapleIndex, -1);
  assert.notEqual(installerAssessIndex, -1);
  assert.ok(stapleIndex < installerAssessIndex);
});

test("local signed macOS installer script mirrors release signing and notarization", async () => {
  const [signScript, packageJson] = await Promise.all([
    readRepoFile("scripts/build-signed-macos-installer.sh"),
    readRepoFile("package.json")
  ]);

  assert.match(packageJson, /"build:mac-signed-installer": "bash \.\/scripts\/build-signed-macos-installer\.sh"/);
  assert.match(signScript, /require_env APP_IDENTITY/);
  assert.match(signScript, /require_env APPLE_NOTARY_KEY_PATH/);
  assert.match(signScript, /Required unless --skip-notarize is used:/);
  assert.match(
    signScript,
    /if \[\[ "\$SKIP_NOTARIZE" == "0" \]\]; then[\s\S]*require_env APPLE_NOTARY_KEY_PATH[\s\S]*require_env APPLE_NOTARY_KEY_ID[\s\S]*require_env APPLE_NOTARY_ISSUER_ID[\s\S]*require_env APPLE_TEAM_ID[\s\S]*require_command spctl[\s\S]*require_command xcrun[\s\S]*NOTARY_KEY_PATH="\$\(notary_key_path\)"[\s\S]*fi/
  );
  assert.match(signScript, /npm run prepare:runtime-artifacts/);
  assert.match(signScript, /npm run build:mac-installer -- --stage-only/);
  assert.match(signScript, /trap 'error_trap \$LINENO "\$BASH_COMMAND"' ERR/);
  assert.match(signScript, /log_environment_summary/);
  assert.match(signScript, /log_artifact_summary/);
  assert.match(signScript, /SIGNED_RUNTIME_COUNT=\$\(\(SIGNED_RUNTIME_COUNT \+ 1\)\)/);
  assert.match(signScript, /Signed \$SIGNED_RUNTIME_COUNT packaged runtime Mach-O file/);
  assert.match(signScript, /shasum -a 256 "\$INSTALLER_PATH" > "\$CHECKSUM_PATH"/);
  assert.match(signScript, /Installer size:/);
  assert.doesNotMatch(signScript, /CHILLCLAW_REQUIRE_CLI_RUNTIME_ARTIFACTS/);
  assert.match(signScript, /NODE_RUNTIME_ENTITLEMENTS="scripts\/macos-node-runtime-entitlements\.plist"/);
  assert.match(signScript, /find "\$APP_PATH\/Contents\/Resources\/app\/runtime-artifacts" -type f -print0/);
  assert.doesNotMatch(signScript, /runtime-artifacts" -type f -perm -111 -print0/);
  assert.match(
    signScript,
    /codesign --force --sign "\$APP_IDENTITY" --options runtime --timestamp --entitlements "\$NODE_RUNTIME_ENTITLEMENTS" "\$RUNTIME_EXECUTABLE"/
  );
  assert.match(signScript, /codesign --force --sign "\$APP_IDENTITY" --options runtime --timestamp --entitlements "\$DAEMON_ENTITLEMENTS"/);
  assert.match(signScript, /npm run build:mac-installer -- --skip-build --dmg-only/);
  assert.match(signScript, /codesign --force --sign "\$APP_IDENTITY" --timestamp "\$INSTALLER_PATH"/);
  assert.match(signScript, /xcrun notarytool submit "\$INSTALLER_PATH"[\s\S]*--output-format json/);
  assert.match(signScript, /parse_notary_field status/);
  assert.match(signScript, /xcrun notarytool log "\$NOTARY_SUBMISSION_ID"/);
  assert.match(signScript, /not stapling invalid DMG/);
  assert.match(signScript, /xcrun stapler staple "\$INSTALLER_PATH"/);
  assert.match(signScript, /spctl --assess --type open --context context:primary-signature --verbose=2 "\$INSTALLER_PATH"/);
});

test("macOS release workflow preserves Node runtime entitlements on the packaged daemon", async () => {
  const [workflow, entitlements] = await Promise.all([
    readRepoFile(".github/workflows/macos-release.yml"),
    readRepoFile("scripts/macos-daemon-entitlements.plist")
  ]);

  assert.match(entitlements, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
  assert.match(workflow, /DAEMON_ENTITLEMENTS:\s*scripts\/macos-daemon-entitlements\.plist/);
  assert.match(
    workflow,
    /codesign --force --sign "\$APP_IDENTITY" --options runtime --timestamp --entitlements "\$DAEMON_ENTITLEMENTS" "\$APP_PATH\/Contents\/Resources\/runtime\/chillclaw-daemon"/
  );
  assert.doesNotMatch(
    workflow,
    /codesign --force --deep --sign "\$APP_IDENTITY" --options runtime --timestamp "\$APP_PATH"/
  );
  assert.match(workflow, /codesign --force --sign "\$APP_IDENTITY" --options runtime --timestamp "\$APP_PATH"/);
});

test("macOS release workflow signs the packaged Node runtime with V8 entitlements", async () => {
  const [workflow, entitlements] = await Promise.all([
    readRepoFile(".github/workflows/macos-release.yml"),
    readRepoFile("scripts/macos-node-runtime-entitlements.plist")
  ]);

  assert.match(entitlements, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
  assert.match(workflow, /NODE_RUNTIME_ENTITLEMENTS:\s*scripts\/macos-node-runtime-entitlements\.plist/);
  assert.match(workflow, /is_node_runtime_executable/);
  assert.match(workflow, /find "\$APP_PATH\/Contents\/Resources\/app\/runtime-artifacts" -type f -print0/);
  assert.doesNotMatch(workflow, /runtime-artifacts" -type f -perm -111 -print0/);
  assert.match(
    workflow,
    /codesign --force --sign "\$APP_IDENTITY" --options runtime --timestamp --entitlements "\$NODE_RUNTIME_ENTITLEMENTS" "\$RUNTIME_EXECUTABLE"/
  );
});

test("macOS installer builder exposes staging-only and DMG-only release modes", async () => {
  const buildScript = await readRepoFile("scripts/build-macos-installer.mjs");

  assert.match(buildScript, /--stage-only/);
  assert.match(buildScript, /--dmg-only/);
  assert.match(buildScript, /No staged ChillClaw\.app found/);
});

test("macOS installer builder stages runtime artifacts and LaunchAgent runtime environment", async () => {
  const [buildScript, runtimeManifest, packageJson, workflow, prepareScript] = await Promise.all([
    readRepoFile("scripts/build-macos-installer.mjs"),
    readRepoFile("runtime-manifest.lock.json"),
    readRepoFile("package.json"),
    readRepoFile(".github/workflows/macos-release.yml"),
    readRepoFile("scripts/prepare-runtime-artifacts.mjs")
  ]);

  assert.match(buildScript, /runtime-artifacts/);
  assert.match(buildScript, /runtime-manifest\.lock\.json/);
  assert.match(buildScript, /verbatimSymlinks:\s*true/);
  assert.match(
    buildScript,
    /cp\(APP_BUNDLE, resolve\(DMG_STAGING_DIR, `\$\{APP_NAME\}\.app`\), \{ recursive: true, verbatimSymlinks: true \}\)/
  );
  assert.doesNotMatch(buildScript, /CHILLCLAW_REQUIRE_CLI_RUNTIME_ARTIFACTS/);
  assert.match(buildScript, /await assertPackagedCliRuntimeArtifacts\(\);/);
  assert.match(buildScript, /await assertPackagedLocalModelCatalogArtifact\(\);/);
  assert.match(buildScript, /Packaged Node\.js runtime npm is not executable/);
  assert.match(buildScript, /Packaged OpenClaw runtime CLI is not executable/);
  assert.match(buildScript, /Packaged Ollama runtime is missing the runnable ollama CLI binary/);
  assert.match(buildScript, /Packaged Ollama runtime CLI cannot run/);
  assert.match(buildScript, /Packaged local model catalog is missing/);
  assert.match(buildScript, /Packaged local model catalog must include gemma4:e2b/);
  assert.match(buildScript, /Runtime artifacts must be runnable CLI payloads/);
  assert.match(buildScript, /CHILLCLAW_RUNTIME_BUNDLE_DIR/);
  assert.match(buildScript, /CHILLCLAW_RUNTIME_MANIFEST_PATH/);
  assert.match(buildScript, /CHILLCLAW_RUNTIME_UPDATE_FEED_URL/);
  assert.match(packageJson, /prepare:runtime-artifacts/);
  assert.match(workflow, /npm run prepare:runtime-artifacts/);
  assert.doesNotMatch(workflow, /CHILLCLAW_REQUIRE_CLI_RUNTIME_ARTIFACTS/);
  assert.match(workflow, /find "\$APP_PATH\/Contents\/Resources\/app\/runtime-artifacts" -type f -print0/);
  assert.doesNotMatch(workflow, /runtime-artifacts" -type f -perm -111 -print0/);
  assert.match(prepareScript, /Downloaded Node\.js archive npm is not executable/);
  assert.match(prepareScript, /nodejs\.org\/dist/);
  assert.match(prepareScript, /currentNodeDistName/);
  assert.match(prepareScript, /prepareOpenClawRuntime/);
  assert.match(prepareScript, /const nodeRuntime = await prepareNodeRuntime\(resourceFor\(manifest, "node-npm-runtime"\)\)/);
  assert.match(prepareScript, /prepareOpenClawRuntime\(resourceFor\(manifest, "openclaw-runtime"\), nodeRuntime\)/);
  assert.match(prepareScript, /run\(nodeRuntime\.npmBin,\s*\["install", "--prefix", targetDir, packageSpec\]/);
  assert.match(prepareScript, /run\(openclawBin,\s*\["--version"\],\s*\{\s*pathPrefix: nodeRuntime\.binDir\s*\}\)/);
  assert.match(prepareScript, /PATH: \[options\.pathPrefix, process\.env\.PATH\]\.filter\(Boolean\)\.join\(delimiter\)/);
  assert.match(prepareScript, /prepareLocalModelCatalog/);
  assert.match(prepareScript, /openclaw-runtime must pin a concrete version/);
  assert.match(prepareScript, /OpenClaw runtime package did not produce node_modules/);
  assert.match(prepareScript, /Prepared OpenClaw/);
  assert.match(prepareScript, /Prepared local model catalog/);
  assert.match(prepareScript, /process\.arch === "x64" \? "x64" : "arm64"/);
  assert.match(buildScript, /currentNodeDistName/);
  assert.match(buildScript, /resolve\(nodeDir, "bin", "npm"\),\s*\["--version"\]/);
  assert.match(buildScript, /packagedRuntimeEnv\(nodeDir\)/);
  assert.match(buildScript, /npm-cli\.js/);
  assert.match(buildScript, /runPackagedRuntimeCommand\(\s*ollamaPath,\s*\["--version"\]/);
  assert.match(prepareScript, /ollama CLI binary/);
  assert.match(runtimeManifest, /node-npm-runtime/);
  assert.match(runtimeManifest, /openclaw-runtime/);
  assert.match(runtimeManifest, /ollama-runtime/);
  assert.match(runtimeManifest, /local-model-catalog/);
  assert.match(runtimeManifest, /"version": "2026\.3\.11"/);
  assert.match(runtimeManifest, /"id": "openclaw-runtime"[\s\S]*?"sourcePolicy": \["bundled"\]/);
  assert.match(runtimeManifest, /"path": "openclaw\/openclaw-runtime"/);
  assert.match(runtimeManifest, /"path": "models\/local-model-catalog\.json"/);
  assert.doesNotMatch(runtimeManifest, /"id": "openclaw-runtime"[\s\S]*?"version": "latest"/);
  assert.match(runtimeManifest, /"format": "directory"/);
  assert.match(runtimeManifest, /"format": "tgz"/);
  assert.match(runtimeManifest, /"format": "file"/);
  assert.match(runtimeManifest, /ollama-runtime\/bin\/ollama/);
  assert.doesNotMatch(runtimeManifest, /Ollama\.app/);
  assert.doesNotMatch(runtimeManifest, /Ollama\.dmg/);
});

test("managed OpenClaw runtime packaging stays pinned and bundled-only", async () => {
  const [runtimeManifest, runtimeManager, openClawAdapter, packageJson, buildScript, nativeDaemonManager] = await Promise.all([
    readRepoFile("runtime-manifest.lock.json"),
    readRepoFile("apps/daemon/src/runtime-manager/default-runtime-manager.ts"),
    readRepoFile("apps/daemon/src/engine/openclaw-adapter.ts"),
    readRepoFile("package.json"),
    readRepoFile("scripts/build-macos-installer.mjs"),
    readRepoFile("apps/macos-native/Sources/ChillClawNative/DaemonManagers.swift")
  ]);

  assert.match(runtimeManifest, /"id": "openclaw-runtime"[\s\S]*?"version": "2026\.3\.11"/);
  assert.match(runtimeManager, /DEFAULT_OPENCLAW_VERSION = process\.env\.CHILLCLAW_MANAGED_OPENCLAW_VERSION\?\.trim\(\) \|\| "2026\.3\.11"/);
  assert.match(openClawAdapter, /OPENCLAW_INSTALL_TARGET = OPENCLAW_VERSION_OVERRIDE \?\? "2026\.3\.11"/);
  assert.doesNotMatch(runtimeManager, /DEFAULT_OPENCLAW_VERSION = process\.env\.CHILLCLAW_MANAGED_OPENCLAW_VERSION\?\.trim\(\) \|\| "latest"/);
  assert.doesNotMatch(openClawAdapter, /OPENCLAW_INSTALL_TARGET = OPENCLAW_VERSION_OVERRIDE \?\? "latest"/);
  assert.doesNotMatch(packageJson, /bootstrap:openclaw/);
  assert.doesNotMatch(buildScript, /bootstrap-openclaw\.mjs/);
  assert.doesNotMatch(buildScript, /CHILLCLAW_OPENCLAW_BOOTSTRAP_SCRIPT/);
  assert.doesNotMatch(nativeDaemonManager, /bootstrap-openclaw\.mjs/);
  assert.doesNotMatch(nativeDaemonManager, /CHILLCLAW_OPENCLAW_BOOTSTRAP_SCRIPT/);
});

test("local macOS installer builds warn before users share unsigned DMGs", async () => {
  const [buildScript, readme] = await Promise.all([
    readRepoFile("scripts/build-macos-installer.mjs"),
    readRepoFile("README.md")
  ]);

  assert.match(buildScript, /warnAboutLocalDistributionReadiness/);
  assert.match(buildScript, /Gatekeeper may report ChillClaw as damaged/);
  assert.match(buildScript, /Use the signed and notarized GitHub release DMG/);
  assert.match(buildScript, /!options\.stageOnly && !options\.dmgOnly/);
  assert.match(readme, /local smoke testing/);
  assert.match(readme, /signed and notarized GitHub release DMG/);
});
