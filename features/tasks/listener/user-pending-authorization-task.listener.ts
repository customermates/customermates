import type { Task, TaskType } from "@/generated/prisma";
import type { DomainEventHandlers } from "@/features/event/domain-event.listener";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";

export abstract class TaskRepo {
  abstract findByTypeAndRelatedUserIdCompanyWide(args: { type: TaskType; relatedUserId: string }): Promise<Task | null>;
  abstract create(args: { type: TaskType; userIds?: string[]; relatedUserId?: string; name?: string }): Promise<Task>;
  abstract deleteById(args: { id: string }): Promise<void>;
}

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
