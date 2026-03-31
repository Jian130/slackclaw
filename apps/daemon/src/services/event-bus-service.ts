import type { ChillClawEvent } from "@chillclaw/contracts";

export type EventBusListener = (event: ChillClawEvent) => void;

export class EventBusService {
  private readonly listeners = new Set<EventBusListener>();
  private readonly retainedEvents = new Map<string, ChillClawEvent>();

  subscribe(listener: EventBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ChillClawEvent): void {
    const retainedKey = retainedEventKey(event);
    if (retainedKey) {
      this.retainedEvents.set(retainedKey, event);
    }

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

function retainedEventKey(event: ChillClawEvent): string | undefined {
  switch (event.type) {
    case "overview.updated":
    case "ai-team.updated":
    case "model-config.updated":
    case "channel-config.updated":
    case "plugin-config.updated":
    case "skill-catalog.updated":
    case "preset-skill-sync.updated":
      return event.type;
    default:
      return undefined;
  }
}
