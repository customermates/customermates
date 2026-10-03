import type { DomainEventHandlers } from "@/features/event/domain-event.listener";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";

export class UserPendingAuthorizationTaskListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(private tasks: { registered(userId: string): Promise<void>; updated(userId: string): Promise<void> }) {
    super();

    this.handlers = {
      [DomainEvent.USER_REGISTERED]: async ({ entityId, payload }) => {
        if (payload?.isNewCompany) return;

        await this.tasks.registered(entityId);
      },

      [DomainEvent.USER_UPDATED]: ({ entityId }) => this.tasks.updated(entityId),
    };
  }
}
