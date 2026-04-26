import type { ChillClawEvent } from "@chillclaw/contracts";

import { type LogMetadata, writeCommunicationLog } from "./logger.js";

export type EventBusListener = (event: ChillClawEvent) => void;
export type CommunicationLogWriter = (message: string, details?: unknown, metadata?: LogMetadata) => void;

export class EventBusService {
  private readonly listeners = new Set<EventBusListener>();
  private readonly retainedEvents = new Map<string, ChillClawEvent>();

  constructor(private readonly communicationLogger: CommunicationLogWriter = writeCommunicationLog) {}

  subscribe(listener: EventBusListener): () => void {
    this.listeners.add(listener);
    this.communicationLogger("Daemon event bus subscriber attached.", {
      listenerCount: this.listeners.size
    }, {
      scope: "communication.eventBus.subscribe"
    });
    return () => {
      this.listeners.delete(listener);
      this.communicationLogger("Daemon event bus subscriber detached.", {
        listenerCount: this.listeners.size
      }, {
        scope: "communication.eventBus.unsubscribe"
      });
    };
  }

  publish(event: ChillClawEvent): void {
    const retainedKey = retainedEventKey(event);
    if (retainedKey) {
      this.retainedEvents.set(retainedKey, event);
    }

    this.communicationLogger("Daemon event bus published an event.", {
      ...eventCommunicationSummary(event),
      listenerCount: this.listeners.size,
      retained: Boolean(retainedKey)
    }, {
      scope: "communication.eventBus.publish"
    });

    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  getRetainedEvents(): ChillClawEvent[] {
    return [...this.retainedEvents.values()];
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

function eventCommunicationSummary(event: ChillClawEvent): Record<string, unknown> {
  switch (event.type) {
    case "overview.updated":
    case "ai-team.updated":
    case "model-config.updated":
    case "channel-config.updated":
    case "plugin-config.updated":
    case "skill-catalog.updated":
    case "preset-skill-sync.updated":
    case "downloads.updated":
      return {
        eventType: event.type,
        revision: event.snapshot.revision,
        epoch: event.snapshot.epoch
      };
    case "operation.updated":
    case "operation.completed":
      return {
        eventType: event.type,
        operationId: event.operation.data.operationId,
        operationScope: event.operation.data.scope,
        operationAction: event.operation.data.action,
        operationStatus: event.operation.data.status,
        operationPhase: event.operation.data.phase,
        revision: event.operation.revision
      };
    case "channel.session.updated":
      return {
        eventType: event.type,
        channelId: event.channelId,
        sessionId: event.session.id,
        sessionStatus: event.session.status
      };
    case "chat.stream":
      return {
        eventType: event.type,
        threadId: event.threadId,
        payloadType: event.payload.type
      };
    default:
      return {
        eventType: event.type
      };
  }
}

function retainedEventKey(event: ChillClawEvent): string | undefined {
  switch (event.type) {
    case "overview.updated":
    case "ai-team.updated":
    case "model-config.updated":
    case "channel-config.updated":
    case "plugin-config.updated":
    case "skill-catalog.updated":
    case "preset-skill-sync.updated":
    case "downloads.updated":
      return event.type;
    case "local-runtime.progress":
    case "local-runtime.completed":
      return `local-runtime:${event.action}`;
    case "operation.updated":
    case "operation.completed":
      return `operation:${event.operation.data.operationId}`;
    default:
      return undefined;
  }
}
