import type { IncomingMessage } from "node:http";

import type {
  AbortChatRequest,
  BindAIMemberChannelRequest,
  ChannelSessionInputRequest,
  CompleteOnboardingRequest,
  CreateChatThreadRequest,
  DeleteAIMemberRequest,
  EngineTaskRequest,
  InstallRequest,
  InstallSkillRequest,
  ModelAuthRequest,
  ModelAuthSessionInputRequest,
  OnboardingEmployeeState,
  OnboardingStepNavigationRequest,
  RemoveChannelEntryRequest,
  RemoveSkillRequest,
  ReplaceFallbackModelEntriesRequest,
  SaveAIMemberRequest,
  SaveChannelEntryRequest,
  SaveCustomSkillRequest,
  SaveModelEntryRequest,
  SaveTeamRequest,
  SetDefaultModelEntryRequest,
  UpdateSkillRequest
} from "@chillclaw/contracts";

import type { EngineReadCacheResource } from "../engine/adapter.js";
import type { ServerContext } from "./server-context.js";

export type JsonBody =
  | AbortChatRequest
  | BindAIMemberChannelRequest
  | ChannelSessionInputRequest
  | CompleteOnboardingRequest
  | CreateChatThreadRequest
  | DeleteAIMemberRequest
  | EngineTaskRequest
  | InstallRequest
  | InstallSkillRequest
  | ModelAuthRequest
  | ModelAuthSessionInputRequest
  | OnboardingEmployeeState
  | OnboardingStepNavigationRequest
  | Record<string, unknown>
  | RemoveChannelEntryRequest
  | RemoveSkillRequest
  | ReplaceFallbackModelEntriesRequest
  | SaveAIMemberRequest
  | SaveChannelEntryRequest
  | SaveCustomSkillRequest
  | SaveModelEntryRequest
  | SaveTeamRequest
  | SetDefaultModelEntryRequest
  | UpdateSkillRequest;

export type RouteParams = Record<string, string>;

export interface RouteRequestContext<P extends RouteParams = RouteParams> {
  context: ServerContext;
  request: IncomingMessage;
  requestUrl: URL;
  pathname: string;
  params: P;
}

export interface RouteResponse {
  statusCode?: number;
  body: unknown;
}

export interface RouteDefinition<P extends RouteParams = RouteParams> {
  method: IncomingMessage["method"];
  match(pathname: string): P | undefined;
  freshReadInvalidationTargets?: EngineReadCacheResource[];
  snapshotPolicy?: "publish" | "silent";
  handle(args: RouteRequestContext<P>): Promise<RouteResponse>;
}
