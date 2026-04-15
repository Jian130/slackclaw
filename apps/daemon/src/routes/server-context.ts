import { createEngineAdapter } from "../engine/registry.js";
import { createDownloadManager } from "../download-manager/default-download-manager.js";
import type { DownloadManager } from "../download-manager/download-manager.js";
import { createDefaultSecretsAdapter } from "../platform/macos-keychain-secrets-adapter.js";
import { createRuntimeManager } from "../runtime-manager/default-runtime-manager.js";
import type { RuntimeManager } from "../runtime-manager/runtime-manager.js";
import { AppControlService } from "../services/app-control-service.js";
import { AppServiceManager } from "../services/app-service-manager.js";
import { AppUpdateService } from "../services/app-update-service.js";
import { AITeamService } from "../services/ai-team-service.js";
import { ChatService as DaemonChatService } from "../services/chat-service.js";
import { ChannelSetupService } from "../services/channel-setup-service.js";
import { EventBusService } from "../services/event-bus-service.js";
import { EventPublisher } from "../services/event-publisher.js";
import { createLocalModelRuntimeService, type LocalModelRuntimeService } from "../services/local-model-runtime-service.js";
import { OnboardingService } from "../services/onboarding-service.js";
import { OverviewService } from "../services/overview-service.js";
import { PluginService } from "../services/plugin-service.js";
import { PresetSkillService } from "../services/preset-skill-service.js";
import { SetupService } from "../services/setup-service.js";
import { SkillService } from "../services/skill-service.js";
import { StateStore } from "../services/state-store.js";
import { TaskService } from "../services/task-service.js";

export interface ServerContext {
  adapter: ReturnType<typeof createEngineAdapter>;
  secrets: ReturnType<typeof createDefaultSecretsAdapter>;
  store: StateStore;
  appServiceManager: AppServiceManager;
  appUpdateService: AppUpdateService;
  downloadManager: DownloadManager;
  runtimeManager: RuntimeManager;
  overviewService: OverviewService;
  localModelRuntimeService: LocalModelRuntimeService;
  eventBus: EventBusService;
  eventPublisher: EventPublisher;
  presetSkillService: PresetSkillService;
  channelSetupService: ChannelSetupService;
  pluginService: PluginService;
  aiTeamService: AITeamService;
  chatService: DaemonChatService;
  skillService: SkillService;
  setupService: SetupService;
  onboardingService: OnboardingService;
  taskService: TaskService;
  appControlService: AppControlService;
}

export function createServerContext(setServerStop: () => void): ServerContext {
  const secrets = createDefaultSecretsAdapter();
  const store = new StateStore();
  const appServiceManager = new AppServiceManager();
  const appUpdateService = new AppUpdateService();
  const eventBus = new EventBusService();
  const eventPublisher = new EventPublisher(eventBus);
  const downloadManager = createDownloadManager(eventBus);
  const runtimeManager = createRuntimeManager(eventPublisher, downloadManager);
  const adapter = createEngineAdapter({ runtimeManager });
  const localModelRuntimeService = createLocalModelRuntimeService(adapter, store, eventPublisher, runtimeManager, downloadManager);
  const overviewService = new OverviewService(adapter, store, appServiceManager, appUpdateService, localModelRuntimeService, runtimeManager);
  const presetSkillService = new PresetSkillService(adapter, store, eventPublisher);
  const channelSetupService = new ChannelSetupService(adapter, store, eventPublisher, secrets);
  const pluginService = new PluginService(adapter, eventPublisher);
  const aiTeamService = new AITeamService(adapter, store, eventPublisher, presetSkillService);
  const chatService = new DaemonChatService(adapter, store, aiTeamService, eventPublisher);
  const skillService = new SkillService(adapter, store, eventPublisher, presetSkillService);
  const setupService = new SetupService(adapter, store, overviewService, eventPublisher);
  const onboardingService = new OnboardingService(
    adapter,
    store,
    overviewService,
    channelSetupService,
    aiTeamService,
    presetSkillService,
    eventPublisher,
    localModelRuntimeService
  );
  const taskService = new TaskService(adapter, store, eventPublisher);
  const appControlService = new AppControlService(setServerStop);

  return {
    adapter,
    secrets,
    store,
    appServiceManager,
    appUpdateService,
    downloadManager,
    runtimeManager,
    overviewService,
    localModelRuntimeService,
    eventBus,
    eventPublisher,
    presetSkillService,
    channelSetupService,
    pluginService,
    aiTeamService,
    chatService,
    skillService,
    setupService,
    onboardingService,
    taskService,
    appControlService
  };
}
