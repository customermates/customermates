import type { DomainEventMap } from "@/features/event/domain-events";
import type { DomainEvent } from "@/features/event/domain-events";

import type { TaskType } from "@/generated/prisma";

type Handlers = { [K in DomainEvent]?: (payload: DomainEventMap[K]) => Promise<void> };

export abstract class BaseTaskListener {
  private readonly handlers: Handlers = {};

  constructor(protected taskType: TaskType) {
    this.registerEventHandlers();
  }

  protected abstract registerEventHandlers(): void;

  protected onEvent<E extends DomainEvent>(event: E, handler: Handlers[E]): void {
    this.handlers[event] = handler;
  }

  async handle<E extends DomainEvent>(event: E, payload: DomainEventMap[E]): Promise<void> {
    const handler = this.handlers[event];

    if (!handler) return;

    await handler(payload);
  }
}
