import type {
  ChannelSession,
  ConfiguredChannelEntry,
  InstallSkillRequest,
  InstalledSkillDetail,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  ModelAuthSessionResponse,
  ModelConfigActionResponse,
  ModelConfigOverview,
  RemoveChannelEntryRequest,
  RemoveSkillRequest,
  ReplaceFallbackModelEntriesRequest,
  SaveChannelEntryRequest,
  SaveCustomSkillRequest,
  SaveModelEntryRequest,
  SetDefaultModelEntryRequest,
  SkillMarketplaceDetail,
  SkillMarketplaceEntry,
  SupportedChannelId,
  UpdateSkillRequest
} from "@chillclaw/contracts";

import type { ChannelSetupState } from "@chillclaw/contracts";
import type {
  ConfigManager,
  ManagedLocalModelEntryRequest,
  ManagedSkillInstallRequest,
  ManagedSkillInstallResult,
  SkillRuntimeCatalog,
  SkillRuntimeEntry
} from "./adapter.js";
import { NoopSecretsAdapter, modelAuthSecretName, type SecretsAdapter } from "../platform/secrets-adapter.js";

type ConfigAccess = {
  getModelConfig: () => Promise<ModelConfigOverview>;
  getModelSelection: () => Promise<Pick<ModelConfigOverview, "savedEntries" | "defaultEntryId" | "defaultModel">>;
  canReuseSavedModelEntry: (entryId: string) => Promise<boolean>;
  createSavedModelEntry: (request: SaveModelEntryRequest) => Promise<ModelConfigActionResponse>;
  updateSavedModelEntry: (entryId: string, request: SaveModelEntryRequest) => Promise<ModelConfigActionResponse>;
  upsertManagedLocalModelEntry: (request: ManagedLocalModelEntryRequest) => Promise<ModelConfigActionResponse>;
  removeSavedModelEntry: (entryId: string) => Promise<ModelConfigActionResponse>;
  setDefaultModelEntry: (request: SetDefaultModelEntryRequest) => Promise<ModelConfigActionResponse>;
  replaceFallbackModelEntries: (request: ReplaceFallbackModelEntriesRequest) => Promise<ModelConfigActionResponse>;
  authenticateModelProvider: (request: ModelAuthRequest) => Promise<ModelConfigActionResponse>;
  getModelAuthSession: (sessionId: string) => Promise<ModelAuthSessionResponse>;
  submitModelAuthSessionInput: (sessionId: string, request: ModelAuthSessionInputRequest) => Promise<ModelAuthSessionResponse>;
  setDefaultModel: (modelKey: string) => Promise<ModelConfigActionResponse>;
  getChannelState: (channelId: SupportedChannelId) => Promise<ChannelSetupState>;
  getConfiguredChannelEntries: () => Promise<ConfiguredChannelEntry[]>;
  saveChannelEntry: (request: SaveChannelEntryRequest) => Promise<{ message: string; channel: ChannelSetupState; session?: ChannelSession; requiresGatewayApply?: boolean }>;
  removeChannelEntry: (request: RemoveChannelEntryRequest) => Promise<{ message: string; channelId: SupportedChannelId; requiresGatewayApply?: boolean }>;
  getSkillRuntimeCatalog: () => Promise<SkillRuntimeCatalog>;
  getInstalledSkillDetail: (skillId: string) => Promise<InstalledSkillDetail>;
  listMarketplaceInstalledSkills: () => Promise<Array<{ slug: string; version?: string }>>;
  exploreSkillMarketplace: (limit?: number) => Promise<SkillMarketplaceEntry[]>;
  searchSkillMarketplace: (query: string, limit?: number) => Promise<SkillMarketplaceEntry[]>;
  getSkillMarketplaceDetail: (slug: string) => Promise<SkillMarketplaceDetail>;
  installMarketplaceSkill: (request: InstallSkillRequest) => Promise<{ requiresGatewayApply?: boolean }>;
  updateMarketplaceSkill: (slug: string, request: UpdateSkillRequest) => Promise<{ requiresGatewayApply?: boolean }>;
  saveCustomSkill: (skillId: string | undefined, request: SaveCustomSkillRequest) => Promise<{ slug: string; requiresGatewayApply?: boolean }>;
  removeInstalledSkill: (
    slug: string,
    request: RemoveSkillRequest & { managedBy: "clawhub" | "chillclaw-custom" }
  ) => Promise<{ requiresGatewayApply?: boolean }>;
  installManagedSkill: (request: ManagedSkillInstallRequest) => Promise<ManagedSkillInstallResult>;
  verifyManagedSkill: (slug: string) => Promise<SkillRuntimeEntry | undefined>;
};

export class OpenClawConfigManager implements ConfigManager {
  private readonly secrets: SecretsAdapter;
  private readonly resolveModelAuthSecretFieldIds: (providerId: string, methodId: string) => string[];

  constructor(
    private readonly access: ConfigAccess,
    options?: {
      secrets?: SecretsAdapter;
      resolveModelAuthSecretFieldIds?: (providerId: string, methodId: string) => string[];
    }
  ) {
    this.secrets = options?.secrets ?? new NoopSecretsAdapter();
    this.resolveModelAuthSecretFieldIds = options?.resolveModelAuthSecretFieldIds ?? (() => []);
  }

  private async persistModelSecrets(providerId: string, methodId: string, values: Record<string, string>): Promise<void> {
    const fieldIds = this.resolveModelAuthSecretFieldIds(providerId, methodId);

    await Promise.all(
      fieldIds.map(async (fieldId) => {
        const value = values[fieldId]?.trim();
        if (!value) {
          return;
        }

        await this.secrets.set(modelAuthSecretName(providerId, methodId, fieldId), value);
      })
    );
  }

  getModelConfig() {
    return this.access.getModelConfig();
  }

  getModelSelection() {
    return this.access.getModelSelection();
  }

  canReuseSavedModelEntry(entryId: string) {
    return this.access.canReuseSavedModelEntry(entryId);
  }

  async createSavedModelEntry(request: SaveModelEntryRequest) {
    await this.persistModelSecrets(request.providerId, request.methodId, request.values);
    return this.access.createSavedModelEntry(request);
  }

  async updateSavedModelEntry(entryId: string, request: SaveModelEntryRequest) {
    await this.persistModelSecrets(request.providerId, request.methodId, request.values);
    return this.access.updateSavedModelEntry(entryId, request);
  }

  upsertManagedLocalModelEntry(request: ManagedLocalModelEntryRequest) {
    return this.access.upsertManagedLocalModelEntry(request);
  }

  removeSavedModelEntry(entryId: string) {
    return this.access.removeSavedModelEntry(entryId);
  }

  setDefaultModelEntry(request: SetDefaultModelEntryRequest) {
    return this.access.setDefaultModelEntry(request);
  }

  replaceFallbackModelEntries(request: ReplaceFallbackModelEntriesRequest) {
    return this.access.replaceFallbackModelEntries(request);
  }

  async authenticateModelProvider(request: ModelAuthRequest) {
    await this.persistModelSecrets(request.providerId, request.methodId, request.values);
    return this.access.authenticateModelProvider(request);
  }

  getModelAuthSession(sessionId: string) {
    return this.access.getModelAuthSession(sessionId);
  }

  submitModelAuthSessionInput(sessionId: string, request: ModelAuthSessionInputRequest) {
    return this.access.submitModelAuthSessionInput(sessionId, request);
  }

  setDefaultModel(modelKey: string) {
    return this.access.setDefaultModel(modelKey);
  }

  getChannelState(channelId: SupportedChannelId) {
    return this.access.getChannelState(channelId);
  }

  getConfiguredChannelEntries() {
    return this.access.getConfiguredChannelEntries();
  }

  saveChannelEntry(request: SaveChannelEntryRequest) {
    return this.access.saveChannelEntry(request);
  }

  removeChannelEntry(request: RemoveChannelEntryRequest) {
    return this.access.removeChannelEntry(request);
  }

  getSkillRuntimeCatalog() {
    return this.access.getSkillRuntimeCatalog();
  }

  getInstalledSkillDetail(skillId: string) {
    return this.access.getInstalledSkillDetail(skillId);
  }

  listMarketplaceInstalledSkills() {
    return this.access.listMarketplaceInstalledSkills();
  }

  exploreSkillMarketplace(limit?: number) {
    return this.access.exploreSkillMarketplace(limit);
  }

  searchSkillMarketplace(query: string, limit?: number) {
    return this.access.searchSkillMarketplace(query, limit);
  }

  getSkillMarketplaceDetail(slug: string) {
    return this.access.getSkillMarketplaceDetail(slug);
  }

  installMarketplaceSkill(request: InstallSkillRequest) {
    return this.access.installMarketplaceSkill(request);
  }

  updateMarketplaceSkill(slug: string, request: UpdateSkillRequest) {
    return this.access.updateMarketplaceSkill(slug, request);
  }

  saveCustomSkill(skillId: string | undefined, request: SaveCustomSkillRequest) {
    return this.access.saveCustomSkill(skillId, request);
  }

  removeInstalledSkill(slug: string, request: RemoveSkillRequest & { managedBy: "clawhub" | "chillclaw-custom" }) {
    return this.access.removeInstalledSkill(slug, request);
  }

  installManagedSkill(request: ManagedSkillInstallRequest) {
    return this.access.installManagedSkill(request);
  }

  verifyManagedSkill(slug: string) {
    return this.access.verifyManagedSkill(slug);
  }
}
