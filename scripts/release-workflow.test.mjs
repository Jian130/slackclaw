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
  const signIndex = workflow.indexOf("name: Sign ChillClaw.app");
  const dmgIndex = workflow.indexOf("npm run build:mac-installer -- --skip-build --dmg-only");
  const notarizeIndex = workflow.indexOf("name: Notarize and staple disk image");

  assert.notEqual(stageIndex, -1);
  assert.notEqual(signIndex, -1);
  assert.notEqual(dmgIndex, -1);
  assert.notEqual(notarizeIndex, -1);
  assert.ok(stageIndex < signIndex);
  assert.ok(signIndex < dmgIndex);
  assert.ok(dmgIndex < notarizeIndex);
});

test("macOS release workflow waits for notarization before Gatekeeper assessment", async () => {
  const workflow = await readRepoFile(".github/workflows/macos-release.yml");

  assert.doesNotMatch(workflow, /spctl --assess .*"\$APP_PATH"/);

  const stapleIndex = workflow.indexOf('xcrun stapler staple "$INSTALLER_PATH"');
  const installerAssessIndex = workflow.indexOf(
    'spctl --assess --type open --context context:primary-signature --verbose=2 "$INSTALLER_PATH"'
  );

  assert.notEqual(stapleIndex, -1);
  assert.notEqual(installerAssessIndex, -1);
  assert.ok(stapleIndex < installerAssessIndex);
});

test("macOS installer builder exposes staging-only and DMG-only release modes", async () => {
  const buildScript = await readRepoFile("scripts/build-macos-installer.mjs");

  assert.match(buildScript, /--stage-only/);
  assert.match(buildScript, /--dmg-only/);
  assert.match(buildScript, /No staged ChillClaw\.app found/);
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
