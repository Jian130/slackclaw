import type {
  OperationCommandResponse,
  OperationScope,
  OperationSummary
} from "@chillclaw/contracts";

import { EventPublisher } from "./event-publisher.js";
import { type CommunicationLogWriter } from "./event-bus-service.js";
import { writeCommunicationLog } from "./logger.js";
import { OperationStore } from "./operation-store.js";

export interface OperationRunnerOptions {
  now?: () => string;
  communicationLogger?: CommunicationLogWriter;
}

export interface StartOperationRequest {
  operationId: string;
  scope: OperationScope;
  resourceId?: string;
  action: string;
  phase?: string;
  percent?: number;
  message: string;
  result?: OperationSummary["result"];
}

export interface OperationWorkerContext {
  operation: OperationSummary;
  update: (patch: Partial<OperationSummary>) => Promise<OperationSummary>;
}

export type OperationWorker = (context: OperationWorkerContext) => Promise<Partial<OperationSummary> | void>;

const ACTIVE_OPERATION_STATUSES = new Set<OperationSummary["status"]>(["pending", "running", "timed-out"]);

function defaultNow(): string {
  return new Date().toISOString();
}

function failureMessage(operation: OperationSummary): string {
  const base = operation.message.trim().replace(/[.。]+$/, "");
  return `${base || "Operation"} failed.`;
}

function interruptedMessage(operation: OperationSummary): string {
  const base = operation.message.trim().replace(/[.。]+$/, "");
  return `${base || "Operation"} was interrupted before it finished. Starting again.`;
}

export class OperationRunner {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly now: () => string;
  private readonly communicationLogger: CommunicationLogWriter;

  constructor(
    private readonly operations: OperationStore,
    private readonly publisher: EventPublisher,
    options?: OperationRunnerOptions
  ) {
    this.now = options?.now ?? defaultNow;
    this.communicationLogger = options?.communicationLogger ?? writeCommunicationLog;
  }

  async startOrResume(request: StartOperationRequest, worker: OperationWorker): Promise<OperationCommandResponse> {
    const existing = await this.operations.read(request.operationId);

    if (existing && this.inFlight.has(request.operationId)) {
      this.logOperation("resume", existing);
      return {
        operation: existing,
        accepted: true,
        alreadyRunning: true
      };
    }

    if (existing && ACTIVE_OPERATION_STATUSES.has(existing.status)) {
      const interrupted = await this.operations.fail(
        existing.operationId,
        Object.assign(new Error("Operation was interrupted before it finished."), {
          code: "OPERATION_INTERRUPTED"
        }),
        {
          phase: existing.phase,
          message: interruptedMessage(existing),
          retryable: true,
          updatedAt: this.now()
        }
      );
      if (interrupted) {
        this.publisher.publishOperationCompleted(interrupted);
      }
    }

    const timestamp = this.now();
    const operation: OperationSummary = {
      operationId: request.operationId,
      scope: request.scope,
      resourceId: request.resourceId,
      action: request.action,
      status: "running",
      phase: request.phase,
      percent: request.percent,
      message: request.message,
      result: request.result,
      startedAt: timestamp,
      updatedAt: timestamp
    };

    await this.operations.create(operation);
    this.logOperation("start", operation);
    this.publisher.publishOperationUpdated(operation);
    this.scheduleWorker(operation, worker);

    return {
      operation,
      accepted: true,
      alreadyRunning: false
    };
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()]);
    }
  }

  private scheduleWorker(operation: OperationSummary, worker: OperationWorker): void {
    const promise = new Promise<void>((resolve) => {
      setTimeout(() => {
        void this.runWorker(operation, worker).finally(resolve);
      }, 0);
    }).finally(() => {
      if (this.inFlight.get(operation.operationId) === promise) {
        this.inFlight.delete(operation.operationId);
      }
    });

    this.inFlight.set(operation.operationId, promise);
  }

  private async runWorker(operation: OperationSummary, worker: OperationWorker): Promise<void> {
    let latest = operation;

    const update = async (patch: Partial<OperationSummary>): Promise<OperationSummary> => {
      const updated = await this.operations.update(operation.operationId, {
        ...patch,
        updatedAt: patch.updatedAt ?? this.now()
      });
      if (!updated) {
        throw new Error(`Operation ${operation.operationId} no longer exists.`);
      }
      latest = updated;
      this.logOperation("update", updated);
      this.publisher.publishOperationUpdated(updated);
      return updated;
    };

    try {
      const result = await worker({
        operation,
        update
      });
      const completed = await this.operations.complete(operation.operationId, {
        ...(result ?? {}),
        updatedAt: result?.updatedAt ?? this.now(),
        status: "completed"
      });
      if (completed) {
        this.logOperation("completed", completed);
        this.publisher.publishOperationCompleted(completed);
      }
    } catch (error) {
      const failed = await this.operations.fail(operation.operationId, error, {
        phase: latest.phase,
        message: failureMessage(latest),
        retryable: true,
        updatedAt: this.now()
      });
      if (failed) {
        this.logOperation("failed", failed, error);
        this.publisher.publishOperationCompleted(failed);
      }
    }
  }

  private logOperation(phase: "start" | "resume" | "update" | "completed" | "failed", operation: OperationSummary, error?: unknown): void {
    this.communicationLogger(`Daemon operation ${phase}.`, {
      operationId: operation.operationId,
      scope: operation.scope,
      action: operation.action,
      status: operation.status,
      phase: operation.phase,
      ...(error instanceof Error ? { errorName: error.name } : {})
    }, {
      scope: `communication.operation.${phase}`
    });
  }
}
