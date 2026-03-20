import { DomainEvent, DomainEventMap } from "./domain-events";

import { TenantAgnostic } from "@/core/decorators/tenant-agnostic.decorator";

type EventListeners = <E extends DomainEvent>(event: E, data: DomainEventMap[E]) => Promise<void>;

@TenantAgnostic
export class EventBusWorker {
  private listeners?: EventListeners = undefined;

  injectEventListeners(listener: EventListeners) {
    this.listeners = listener;
  }

  async dispatch<E extends DomainEvent>(event: E, data: DomainEventMap[E]): Promise<void> {
    if (!this.listeners) return;

    await this.listeners(event, data);
  }
}
