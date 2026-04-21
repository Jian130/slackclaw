import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));

test("OpenClawAdapter composes the new coordinators and runtime services", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-adapter.ts"), "utf8");

  assert.match(source, /ChannelsConfigCoordinator/);
  assert.match(source, /ModelsConfigCoordinator/);
  assert.match(source, /AgentsConfigCoordinator/);
  assert.match(source, /OpenClawSkillPluginCoordinator/);
  assert.match(source, /OpenClawRuntimeLifecycleService/);
  assert.match(source, /ChatService/);
});

test("OpenClawAdapter no longer owns the extracted provider catalog and channel workflow bodies", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-adapter.ts"), "utf8");

  assert.doesNotMatch(source, /const MODEL_PROVIDER_DEFINITIONS/);
  assert.doesNotMatch(source, /function createChannelState/);
  assert.doesNotMatch(source, /private async saveChannelEntry/);
  assert.doesNotMatch(source, /async removeChannelEntry\(/);
  assert.doesNotMatch(source, /async prepareFeishu\(/);
  assert.doesNotMatch(source, /async approvePairing\(/);
  assert.doesNotMatch(source, /private async configureTelegram\(/);
  assert.doesNotMatch(source, /private async configureFeishu\(/);
  assert.doesNotMatch(source, /private async configureWechatWorkaround\(/);
  assert.doesNotMatch(source, /private async startWhatsappLogin\(/);
  assert.doesNotMatch(source, /private async startWechatLogin\(/);
  assert.doesNotMatch(source, /private async submitWechatSessionInput\(/);
  assert.doesNotMatch(source, /private async ensureWechatInstallerCommand\(/);
  assert.doesNotMatch(source, /private async resolveWechatInstallerCommand\(/);
  assert.doesNotMatch(source, /private async ensurePersonalWechatRuntimePlugin\(/);
  assert.doesNotMatch(source, /async finalizeOnboardingSetup\(/);
  assert.doesNotMatch(source, /async startGatewayAfterChannels\(/);
});

test("OpenClawAdapter no longer owns the extracted chat, capability, agent, and model workflow bodies", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-adapter.ts"), "utf8");

  assert.doesNotMatch(source, /async getChatThreadDetail\(/);
  assert.doesNotMatch(source, /async sendChatMessage\(/);
  assert.doesNotMatch(source, /async abortChatMessage\(/);
  assert.doesNotMatch(source, /async getSkillRuntimeCatalog\(/);
  assert.doesNotMatch(source, /async getInstalledSkillDetail\(/);
  assert.doesNotMatch(source, /async listMarketplaceInstalledSkills\(/);
  assert.doesNotMatch(source, /async getSkillMarketplaceDetail\(/);
  assert.doesNotMatch(source, /async exploreSkillMarketplace\(/);
  assert.doesNotMatch(source, /async searchSkillMarketplace\(/);
  assert.doesNotMatch(source, /async installMarketplaceSkill\(/);
  assert.doesNotMatch(source, /async installManagedSkill\(/);
  assert.doesNotMatch(source, /async updateMarketplaceSkill\(/);
  assert.doesNotMatch(source, /async saveCustomSkill\(/);
  assert.doesNotMatch(source, /async removeInstalledSkill\(/);
  assert.doesNotMatch(source, /async verifyManagedSkill\(/);
  assert.doesNotMatch(source, /async getPluginConfigOverview\(/);
  assert.doesNotMatch(source, /async ensureFeatureRequirements\(/);
  assert.doesNotMatch(source, /async installPlugin\(/);
  assert.doesNotMatch(source, /async updatePlugin\(/);
  assert.doesNotMatch(source, /async removePlugin\(/);
  assert.doesNotMatch(source, /async submitModelAuthSessionInput\(/);
  assert.doesNotMatch(source, /async createSavedModelEntry\(/);
  assert.doesNotMatch(source, /async updateSavedModelEntry\(/);
  assert.doesNotMatch(source, /async removeSavedModelEntry\(/);
  assert.doesNotMatch(source, /async setDefaultModelEntry\(/);
  assert.doesNotMatch(source, /async replaceFallbackModelEntries\(/);
  assert.doesNotMatch(source, /async authenticateModelProvider\(/);
  assert.doesNotMatch(source, /async setDefaultModel\(/);
  assert.doesNotMatch(source, /private async getModelConfig\(/);
  assert.doesNotMatch(source, /private async startInteractiveModelAuthSession\(/);
  assert.doesNotMatch(source, /private async getModelAuthSession\(/);
  assert.doesNotMatch(source, /private buildSavedModelEntryState\(/);
  assert.doesNotMatch(source, /private applySavedModelEntryState\(/);
  assert.doesNotMatch(source, /private async finalizeSavedModelEntryMetadataOnly\(/);
  assert.doesNotMatch(source, /private async finalizeSavedModelEntryOperation\(/);
  assert.doesNotMatch(source, /private async startEntryAuthentication\(/);
  assert.doesNotMatch(source, /private async createOrUpdateSavedModelEntry\(/);
  assert.doesNotMatch(source, /private async readEntryAuthSummary\(/);
  assert.doesNotMatch(source, /private async replaceEntryProfileIds\(/);
  assert.doesNotMatch(source, /private async syncRuntimeAuthProfiles\(/);
  assert.doesNotMatch(source, /private async syncRuntimeModelChain\(/);
  assert.doesNotMatch(source, /private async removeRuntimeDerivedModelEntry\(/);
  assert.doesNotMatch(source, /private async deleteManagedModelAgent\(/);
  assert.doesNotMatch(source, /private async cleanupRemovedSavedModelEntry\(/);
  assert.doesNotMatch(source, /private async saveAIMemberRuntime\(/);
  assert.doesNotMatch(source, /async getAIMemberBindings\(/);
  assert.doesNotMatch(source, /async bindAIMemberChannel\(/);
  assert.doesNotMatch(source, /async unbindAIMemberChannel\(/);
  assert.doesNotMatch(source, /async deleteAIMemberRuntime\(/);
  assert.doesNotMatch(source, /private async rehydrateMemberAuthFromSavedSecrets\(/);
  assert.doesNotMatch(source, /private async syncMemberBrain\(/);
  assert.doesNotMatch(source, /private async readMemberBindings\(/);
  assert.doesNotMatch(source, /private async bindMemberChannelExclusively\(/);
  assert.doesNotMatch(source, /private async removeManagedPluginConfigEntry\(/);
  assert.doesNotMatch(source, /private async removeChannelConfig\(/);
  assert.doesNotMatch(source, /private async readOpenClawSkillsList\(/);
  assert.doesNotMatch(source, /private async resolveSharedSkillsDir\(/);
  assert.doesNotMatch(source, /private async readWorkspaceSkillMetadata\(/);
  assert.doesNotMatch(source, /private async resolveClawHubContext\(/);
});

test("ModelsConfigCoordinator owns the extracted model overview and auth session workflow", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-models-config-coordinator.ts"), "utf8");

  assert.match(source, /async getModelConfig\(/);
  assert.match(source, /async startInteractiveModelAuthSession\(/);
  assert.match(source, /async getModelAuthSession\(/);
  assert.match(source, /private buildSavedModelEntryState\(/);
  assert.match(source, /private applySavedModelEntryState\(/);
  assert.match(source, /private async finalizeSavedModelEntryMetadataOnly\(/);
  assert.match(source, /private async finalizeSavedModelEntryOperation\(/);
  assert.match(source, /private async startEntryAuthentication\(/);
  assert.match(source, /private async createOrUpdateSavedModelEntry\(/);
  assert.match(source, /async readEntryAuthSummary\(/);
  assert.match(source, /private async replaceEntryProfileIds\(/);
  assert.match(source, /private async syncRuntimeAuthProfiles\(/);
  assert.match(source, /async syncRuntimeModelChain\(/);
  assert.match(source, /private async removeRuntimeDerivedModelEntry\(/);
  assert.match(source, /private async deleteManagedModelAgent\(/);
  assert.match(source, /private async cleanupRemovedSavedModelEntry\(/);
});

test("ChannelsConfigCoordinator owns the extracted channel session and login workflow", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-channels-config-coordinator.ts"), "utf8");

  assert.match(source, /async getChannelState\(/);
  assert.match(source, /async getConfiguredChannelEntries\(/);
  assert.match(source, /async getActiveChannelSession\(/);
  assert.match(source, /async getChannelSession\(/);
  assert.match(source, /private async submitWechatSessionInput\(/);
  assert.match(source, /private async ensurePersonalWechatRuntimePlugin\(/);
});

test("AgentsConfigCoordinator owns the extracted AI member auth, profile sync, and binding workflow", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-agents-config-coordinator.ts"), "utf8");

  assert.match(source, /private async rehydrateMemberAuthFromSavedSecrets\(/);
  assert.match(source, /private async syncMemberBrain\(/);
  assert.match(source, /private async readMemberBindings\(/);
  assert.match(source, /private async readBindingOwnerAgentIds\(/);
  assert.match(source, /private async bindMemberChannelExclusively\(/);
});

test("OpenClawSkillPluginCoordinator owns the extracted marketplace filesystem and managed-plugin cleanup helpers", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-skill-plugin-coordinator.ts"), "utf8");

  assert.match(source, /private async readOpenClawSkillsList\(/);
  assert.match(source, /private async resolveSharedSkillsDir\(/);
  assert.match(source, /private async readWorkspaceSkillMetadata\(/);
  assert.match(source, /private async resolveClawHubContext\(/);
  assert.match(source, /private async removeManagedPluginConfigEntry\(/);
  assert.match(source, /private async removeChannelConfig\(/);
});

test("OpenClawAdapter delegates runtime lifecycle to the runtime service facade", async () => {
  const source = await readFile(resolve(sourceDir, "openclaw-adapter.ts"), "utf8");

  assert.match(source, /return this\.runtimeLifecycleService\.install\(/);
  assert.match(source, /return this\.runtimeLifecycleService\.status\(/);
  assert.match(source, /return this\.runtimeLifecycleService\.updateDeploymentTarget\(/);
  assert.match(source, /return this\.runtimeLifecycleService\.healthCheck\(/);
  assert.match(source, /return this\.runtimeLifecycleService\.runTask\(/);
});
