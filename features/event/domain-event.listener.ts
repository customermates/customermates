import type { DomainEventMap, DomainEvent } from "@/features/event/domain-events";

export type DomainEventHandlers = { [K in DomainEvent]?: (payload: DomainEventMap[K]) => Promise<void> };

export abstract class DomainEventListener {
  abstract readonly handlers: DomainEventHandlers;

  async handle<E extends DomainEvent>(event: E, payload: DomainEventMap[E]): Promise<void> {
    const handler = this.handlers[event];

    if (!handler) return;

    await handler(payload);
  }

  handles(event: DomainEvent): boolean {
    return typeof this.handlers[event] === "function";
  }
}
