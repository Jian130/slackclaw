import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

import type {
  EngineTaskRequest,
  InstallRequest,
  InstallSkillRequest,
  RemoveSkillRequest,
  SaveCustomSkillRequest,
  UpdateSkillRequest
} from "@chillclaw/contracts";

import { getDataDir } from "../runtime-paths.js";
import { clearRuntimeUninstallState, shouldResetStateAfterDeploymentUninstall } from "./runtime-reset.js";
import { jsonResponse, readJson } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

const matchDeployInstall = createPathMatcher("/api/deploy/targets/:targetId/install");
const matchDeployUpdate = createPathMatcher("/api/deploy/targets/:targetId/update");
const matchDeployUninstall = createPathMatcher("/api/deploy/targets/:targetId/uninstall");
const matchPluginInstall = createPathMatcher("/api/plugins/:pluginId/install");
const matchPluginUpdate = createPathMatcher("/api/plugins/:pluginId/update");
const matchPlugin = createPathMatcher("/api/plugins/:pluginId");
const matchSkillMutation = createPathMatcher("/api/skills/:skillId");
const matchRecovery = createPathMatcher("/api/recovery/:actionId");

function requireTargetId(targetId: string): "standard" | "managed-local" {
  if (targetId !== "standard" && targetId !== "managed-local") {
    throw new Error("Unsupported deployment target.");
  }

  return targetId;
}

export const systemRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/ping"),
    async handle() {
      return jsonResponse({ ok: true });
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/events"),
    async handle() {
      return jsonResponse({ error: "Upgrade required. Connect with WebSocket." }, 426);
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/overview"),
    freshReadInvalidationTargets: ["engine", "channels"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.overviewService.getOverview());
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/deploy/targets"),
    async handle({ context }) {
      return jsonResponse(await context.adapter.instances.getDeploymentTargets());
    }
  },
  {
    method: "POST",
    match: matchDeployInstall,
    async handle({ context, params }) {
      const targetId = requireTargetId(params.targetId);
      const correlationId = randomUUID();

      context.eventPublisher.publishDeployProgress({
        correlationId,
        targetId,
        phase: "installing",
        percent: 10,
        message: `ChillClaw is installing the ${targetId} OpenClaw runtime.`
      });

      const result = await context.adapter.instances.installDeploymentTarget(targetId);
      context.eventPublisher.publishDeployCompleted({
        correlationId,
        targetId,
        status: result.status,
        message: result.message,
        engineStatus: result.engineStatus
      });

      return jsonResponse(result);
    }
  },
  {
    method: "POST",
    match: matchDeployUpdate,
    async handle({ context, params }) {
      const targetId = requireTargetId(params.targetId);
      const correlationId = randomUUID();

      context.eventPublisher.publishDeployProgress({
        correlationId,
        targetId,
        phase: "updating",
        percent: 10,
        message: `ChillClaw is updating the ${targetId} OpenClaw runtime.`
      });

      const result = await context.adapter.instances.updateDeploymentTarget(targetId);
      context.eventPublisher.publishDeployCompleted({
        correlationId,
        targetId,
        status: result.status,
        message: result.message,
        engineStatus: result.engineStatus
      });

      return jsonResponse(result);
    }
  },
  {
    method: "POST",
    match: matchDeployUninstall,
    async handle({ context, params }) {
      const targetId = requireTargetId(params.targetId);
      const correlationId = randomUUID();

      context.eventPublisher.publishDeployProgress({
        correlationId,
        targetId,
        phase: "uninstalling",
        percent: 10,
        message: `ChillClaw is removing the ${targetId} OpenClaw runtime.`
      });

      const result = await context.adapter.instances.uninstallDeploymentTarget(targetId);
      if (shouldResetStateAfterDeploymentUninstall(result)) {
        await clearRuntimeUninstallState(context.store);
      }

      context.eventPublisher.publishDeployCompleted({
        correlationId,
        targetId,
        status: result.status,
        message: result.message,
        engineStatus: result.engineStatus
      });

      return jsonResponse(result);
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/deploy/gateway/restart"),
    async handle({ context }) {
      const result = await context.adapter.gateway.restartGateway();
      context.eventPublisher.publishGatewayStatus({
        reachable: result.engineStatus.running && !result.engineStatus.pendingGatewayApply,
        pendingGatewayApply: Boolean(result.engineStatus.pendingGatewayApply),
        summary: result.engineStatus.summary
      });
      return jsonResponse(result);
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/install"),
    async handle({ context, request }) {
      const body = await readJson<InstallRequest>(request);
      const result = await context.adapter.instances.install(body.autoConfigure ?? true, {
        forceLocal: body.forceLocal ?? false
      });

      return jsonResponse({
        install: result,
        overview: await context.overviewService.getOverview()
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/engine/uninstall"),
    async handle({ context }) {
      const result = await context.adapter.instances.uninstall();
      if (result.status === "completed" && !result.engineStatus.installed) {
        await clearRuntimeUninstallState(context.store);
      }

      return jsonResponse({
        result,
        overview: await context.overviewService.getOverview()
      });
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/plugins/config"),
    freshReadInvalidationTargets: ["plugins", "channels"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.pluginService.getConfigOverview());
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/skills/config"),
    freshReadInvalidationTargets: ["skills"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.skillService.getConfigOverview());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/skills/install"),
    async handle({ context, request }) {
      const body = await readJson<InstallSkillRequest>(request);
      return jsonResponse(await context.skillService.installMarketplaceSkill(body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/skills/custom"),
    async handle({ context, request }) {
      const body = await readJson<SaveCustomSkillRequest>(request);
      return jsonResponse(await context.skillService.saveCustomSkill(undefined, body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/skills/preset-sync/repair"),
    async handle({ context }) {
      return jsonResponse(await context.skillService.repairPresetSkillSync());
    }
  },
  {
    method: "PATCH",
    match: matchSkillMutation,
    async handle({ context, request, params }) {
      const body = await readJson<UpdateSkillRequest>(request);
      return jsonResponse(await context.skillService.updateSkill(params.skillId, body));
    }
  },
  {
    method: "DELETE",
    match: matchSkillMutation,
    async handle({ context, request, params }) {
      const body = await readJson<RemoveSkillRequest>(request);
      return jsonResponse(await context.skillService.removeSkill(params.skillId, body));
    }
  },
  {
    method: "POST",
    match: matchPluginInstall,
    async handle({ context, params }) {
      return jsonResponse(await context.pluginService.installPlugin(params.pluginId));
    }
  },
  {
    method: "POST",
    match: matchPluginUpdate,
    async handle({ context, params }) {
      return jsonResponse(await context.pluginService.updatePlugin(params.pluginId));
    }
  },
  {
    method: "DELETE",
    match: matchPlugin,
    async handle({ context, params }) {
      return jsonResponse(await context.pluginService.removePlugin(params.pluginId));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/tasks"),
    async handle({ context, request }) {
      const body = await readJson<EngineTaskRequest>(request);
      return jsonResponse(await context.taskService.runTask(body));
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/update"),
    async handle({ context }) {
      return jsonResponse(await context.adapter.instances.update());
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/service/status"),
    async handle({ context }) {
      return jsonResponse(await context.appServiceManager.getStatus());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/service/install"),
    async handle({ context }) {
      return jsonResponse({
        result: await context.appServiceManager.install(),
        overview: await context.overviewService.getOverview()
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/service/restart"),
    async handle({ context }) {
      return jsonResponse({
        result: await context.appServiceManager.restart(),
        overview: await context.overviewService.getOverview()
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/service/uninstall"),
    async handle({ context }) {
      return jsonResponse({
        result: await context.appServiceManager.uninstall(),
        overview: await context.overviewService.getOverview()
      });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/app/stop"),
    async handle({ context }) {
      return jsonResponse(await context.appControlService.stopApp());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/app/uninstall"),
    async handle({ context }) {
      return jsonResponse(await context.appControlService.uninstallApp());
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/diagnostics"),
    async handle({ context }) {
      const bundle = await context.adapter.instances.exportDiagnostics();
      const diagnosticsPath = resolve(getDataDir(), bundle.filename);
      await writeFile(diagnosticsPath, bundle.content);

      return jsonResponse({
        message: "Diagnostics bundle exported.",
        path: diagnosticsPath
      });
    }
  },
  {
    method: "POST",
    match: matchRecovery,
    async handle({ context, params }) {
      const action = await context.overviewService.findRecoveryAction(params.actionId);

      if (!action) {
        return jsonResponse({ error: "Unknown recovery action." }, 404);
      }

      return jsonResponse({
        result: await context.adapter.instances.repair(action),
        overview: await context.overviewService.getOverview()
      });
    }
  }
];
