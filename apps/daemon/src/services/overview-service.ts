import {
  createDefaultProductOverview,
  type OnboardingSelection,
  type ProductOverview,
  type RecoveryAction
} from "@slackclaw/contracts";

import type { EngineAdapter } from "../engine/adapter.js";
import { AppServiceManager } from "./app-service-manager.js";
import { StateStore } from "./state-store.js";

export class OverviewService {
  constructor(
    private readonly adapter: EngineAdapter,
    private readonly store: StateStore,
    private readonly appServiceManager = new AppServiceManager()
  ) {}

  async getOverview(): Promise<ProductOverview> {
    const base = createDefaultProductOverview();
    const state = await this.store.read();
    const engine = await this.adapter.status();
    const healthChecks = await this.adapter.healthCheck(state.selectedProfileId);
    const appService = await this.appServiceManager.getStatus();

    return {
      ...base,
      firstRun: {
        introCompleted: Boolean(state.introCompletedAt),
        setupCompleted: Boolean(state.setupCompletedAt),
        selectedProfileId: state.selectedProfileId
      },
      appService,
      engine,
      capabilities: this.adapter.capabilities,
      installSpec: this.adapter.installSpec,
      healthChecks,
      recentTasks: state.tasks.slice(-5).reverse(),
      profiles: base.profiles,
      templates: base.templates
    };
  }

  async completeOnboarding(selection: OnboardingSelection): Promise<ProductOverview> {
    await this.adapter.configure(selection.profileId);
    await this.store.update((current) => ({
      ...current,
      selectedProfileId: selection.profileId
    }));

    return this.getOverview();
  }

  async findRecoveryAction(actionId: string): Promise<RecoveryAction | undefined> {
    const overview = await this.getOverview();
    return overview.recoveryActions.find((action) => action.id === actionId);
  }
}
