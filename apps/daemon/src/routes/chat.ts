import type {
  AbortChatRequest,
  CreateChatThreadRequest,
  SendChatMessageRequest
} from "@slackclaw/contracts";

import { jsonResponse, readJson } from "./http.js";
import { createPathMatcher } from "./matchers.js";
import type { RouteDefinition } from "./types.js";

const matchChatThread = createPathMatcher("/api/chat/threads/:threadId");
const matchChatThreadMessages = createPathMatcher("/api/chat/threads/:threadId/messages");
const matchChatThreadAbort = createPathMatcher("/api/chat/threads/:threadId/abort");
const matchMemberBindings = createPathMatcher("/api/ai-members/:memberId/bindings");
const matchMember = createPathMatcher("/api/ai-members/:memberId");
const matchTeam = createPathMatcher("/api/teams/:teamId");

function unsupportedTeamResponse() {
  return jsonResponse(
    {
      error: "AI team backend routes are removed in this refactor. ChillClaw will reintroduce them on the new agent architecture."
    },
    501
  );
}

export const chatRoutes: RouteDefinition[] = [
  {
    method: "GET",
    match: createPathMatcher("/api/chat/overview"),
    async handle({ context }) {
      return jsonResponse(await context.chatService.getOverview());
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/chat/threads"),
    async handle({ context, request }) {
      const body = await readJson<CreateChatThreadRequest>(request);
      return jsonResponse(await context.chatService.createThread(body));
    }
  },
  {
    method: "GET",
    match: matchChatThread,
    async handle({ context, params }) {
      return jsonResponse(await context.chatService.getThreadDetail(params.threadId));
    }
  },
  {
    method: "POST",
    match: matchChatThreadMessages,
    async handle({ context, request, params }) {
      const body = await readJson<SendChatMessageRequest>(request);
      return jsonResponse(await context.chatService.sendMessage(params.threadId, body));
    }
  },
  {
    method: "POST",
    match: matchChatThreadAbort,
    async handle({ context, request, params }) {
      const body = await readJson<AbortChatRequest>(request);
      return jsonResponse(await context.chatService.abortThread(params.threadId, body));
    }
  },
  {
    method: "GET",
    match: createPathMatcher("/api/ai-team/overview"),
    freshReadInvalidationTargets: ["models", "skills", "ai-members"],
    snapshotPolicy: "silent",
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "GET",
    match: matchMemberBindings,
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/ai-members"),
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "PATCH",
    match: matchMember,
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "POST",
    match: matchMemberBindings,
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "DELETE",
    match: matchMemberBindings,
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "DELETE",
    match: matchMember,
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "POST",
    match: createPathMatcher("/api/teams"),
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "PATCH",
    match: matchTeam,
    async handle() {
      return unsupportedTeamResponse();
    }
  },
  {
    method: "DELETE",
    match: matchTeam,
    async handle() {
      return unsupportedTeamResponse();
    }
  }
];
