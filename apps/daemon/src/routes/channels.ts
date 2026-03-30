import type {
  ChannelSessionInputRequest,
  RemoveChannelEntryRequest,
  SaveChannelEntryRequest
} from "@slackclaw/contracts";

import { jsonResponse, readJson } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

const matchChannelEntry = createPathMatcher("/api/channels/entries/:entryId");
const matchChannelSession = createPathMatcher("/api/channels/session/:sessionId");
const matchChannelSessionInput = createPathMatcher("/api/channels/session/:sessionId/input");

export const channelsRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/channels/config"),
    freshReadInvalidationTargets: ["channels", "engine"],
    snapshotPolicy: "silent",
    async handle({ context }) {
      return jsonResponse(await context.channelSetupService.getConfigOverview());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/channels/entries"),
    async handle({ context, request }) {
      const body = await readJson<SaveChannelEntryRequest>(request);
      return jsonResponse(await context.channelSetupService.saveEntry(undefined, body));
    }
  },
  {
    method: "PATCH",
    match: matchChannelEntry,
    async handle({ context, request, params }) {
      const body = await readJson<SaveChannelEntryRequest>(request);
      return jsonResponse(await context.channelSetupService.saveEntry(params.entryId, body));
    }
  },
  {
    method: "DELETE",
    match: matchChannelEntry,
    async handle({ context, request, params }) {
      const body = await readJson<RemoveChannelEntryRequest>(request);
      return jsonResponse(await context.channelSetupService.removeEntry({ ...body, entryId: params.entryId }));
    }
  },
  {
    method: "GET",
    match: matchChannelSession,
    async handle({ context, params }) {
      return jsonResponse(await context.channelSetupService.getSession(params.sessionId));
    }
  },
  {
    method: "POST",
    match: matchChannelSessionInput,
    async handle({ context, request, params }) {
      const body = await readJson<ChannelSessionInputRequest>(request);
      return jsonResponse(await context.channelSetupService.submitSessionInput(params.sessionId, body));
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/channels/feishu/callback"),
    async handle() {
      return jsonResponse({ ok: true, message: "SlackClaw Feishu callback is reachable." });
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/channels/feishu/callback"),
    async handle({ request }) {
      const body = await readJson<Record<string, unknown>>(request);
      const challenge =
        typeof body.challenge === "string"
          ? body.challenge
          : typeof body.encrypt === "string"
            ? body.encrypt
            : undefined;

      return jsonResponse(challenge ? { challenge } : { ok: true, message: "SlackClaw Feishu callback is reachable." });
    }
  }
];
