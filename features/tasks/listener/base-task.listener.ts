import type { DomainEventMap, DomainEvent } from "@/features/event/domain-events";

import type { TaskType } from "@/generated/prisma";

export type DomainEventHandlers = { [K in DomainEvent]?: (payload: DomainEventMap[K]) => Promise<void> };

export abstract class BaseTaskListener {
  abstract readonly handlers: DomainEventHandlers;

  constructor(protected taskType: TaskType) {}

  async handle<E extends DomainEvent>(event: E, payload: DomainEventMap[E]): Promise<void> {
    const handler = this.handlers[event];

    if (!handler) return;

    await handler(payload);
  }

  handles(event: DomainEvent): boolean {
    return typeof this.handlers[event] === "function";
  }
}
