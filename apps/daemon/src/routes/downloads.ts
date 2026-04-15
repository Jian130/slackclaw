import type { DownloadActionResponse } from "@chillclaw/contracts";

import { jsonResponse } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { ServerContext } from "./server-context.js";
import type { RouteDefinition } from "./types.js";

const matchDownloadJob = createPathMatcher("/api/downloads/:jobId");
const matchDownloadAction = createPathMatcher("/api/downloads/:jobId/:action");

async function actionResponse(
  context: ServerContext,
  status: DownloadActionResponse["status"],
  message: string,
  job?: DownloadActionResponse["job"]
): Promise<DownloadActionResponse> {
  return {
    status,
    message,
    job,
    downloads: await context.downloadManager.getOverview()
  };
}

export const downloadsRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/downloads"),
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.downloadManager.getOverview());
    }
  },
  {
    method: "GET",
    match: matchDownloadJob,
    snapshotPolicy: "silent",
    async handle({ context, params }) {
      const job = await context.downloadManager.getJob(params.jobId);
      if (!job) {
        return jsonResponse({ error: "Download job not found." }, 404);
      }
      return jsonResponse(job);
    }
  },
  {
    method: "POST",
    match: matchDownloadAction,
    async handle({ context, params }) {
      switch (params.action) {
        case "pause": {
          const job = await context.downloadManager.pause(params.jobId);
          return jsonResponse(await actionResponse(context, "completed", "Download paused.", job));
        }
        case "resume": {
          const job = await context.downloadManager.resume(params.jobId);
          return jsonResponse(await actionResponse(context, "completed", "Download resumed.", job));
        }
        case "cancel": {
          const job = await context.downloadManager.cancel(params.jobId);
          return jsonResponse(await actionResponse(context, "completed", "Download cancelled.", job));
        }
        default:
          return jsonResponse({ error: `Unsupported download action ${params.action}.` }, 404);
      }
    }
  },
  {
    method: "DELETE",
    match: matchDownloadJob,
    async handle({ context, params }) {
      await context.downloadManager.remove(params.jobId);
      return jsonResponse(await actionResponse(context, "completed", "Download removed."));
    }
  }
];
