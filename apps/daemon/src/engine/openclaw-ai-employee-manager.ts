import type {
  BindAIMemberChannelRequest,
  DeleteAIMemberRequest,
  MemberBindingSummary
} from "@slackclaw/contracts";

import type {
  AIEmployeeManager,
  AIMemberRuntimeCandidate,
  AIMemberRuntimeRequest,
  AIMemberRuntimeState
} from "./adapter.js";

type AIEmployeeAccess = {
  listAIMemberRuntimeCandidates: () => Promise<AIMemberRuntimeCandidate[]>;
  saveAIMemberRuntime: (request: AIMemberRuntimeRequest) => Promise<AIMemberRuntimeState & { requiresGatewayApply?: boolean }>;
  getAIMemberBindings: (agentId: string) => Promise<MemberBindingSummary[]>;
  bindAIMemberChannel: (
    agentId: string,
    request: BindAIMemberChannelRequest
  ) => Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }>;
  unbindAIMemberChannel: (
    agentId: string,
    request: BindAIMemberChannelRequest
  ) => Promise<{ bindings: MemberBindingSummary[]; requiresGatewayApply?: boolean }>;
  deleteAIMemberRuntime: (agentId: string, request: DeleteAIMemberRequest) => Promise<{ requiresGatewayApply?: boolean }>;
};

export class OpenClawAIEmployeeManager implements AIEmployeeManager {
  constructor(private readonly access: AIEmployeeAccess) {}

  listAIMemberRuntimeCandidates() {
    return this.access.listAIMemberRuntimeCandidates();
  }

  saveAIMemberRuntime(request: AIMemberRuntimeRequest) {
    return this.access.saveAIMemberRuntime(request);
  }

  getAIMemberBindings(agentId: string) {
    return this.access.getAIMemberBindings(agentId);
  }

  async bindAIMemberChannel(agentId: string, request: BindAIMemberChannelRequest) {
    return this.access.bindAIMemberChannel(agentId, request);
  }

  async unbindAIMemberChannel(agentId: string, request: BindAIMemberChannelRequest) {
    return this.access.unbindAIMemberChannel(agentId, request);
  }

  deleteAIMemberRuntime(agentId: string, request: DeleteAIMemberRequest) {
    return this.access.deleteAIMemberRuntime(agentId, request);
  }
}
