import type { Task } from "@/generated/prisma";
import type { DomainEventHandlers } from "@/features/event/domain-event.listener";

import { TaskType, Status } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";

export abstract class TaskRepo {
  abstract findByTypeAndRelatedUserIdCompanyWide(args: { type: TaskType; relatedUserId: string }): Promise<Task | null>;
  abstract create(args: { type: TaskType; userIds?: string[]; relatedUserId?: string; name?: string }): Promise<Task>;
  abstract deleteById(args: { id: string }): Promise<void>;
}

export class UserPendingAuthorizationTaskListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;
  private readonly taskType = TaskType.userPendingAuthorization;

  constructor(private repo: TaskRepo) {
    super();

    this.handlers = {
      [DomainEvent.USER_REGISTERED]: async ({ userId, payload }) => {
        if (payload?.isNewCompany) return;

        await this.repo.create({
          type: this.taskType,
          relatedUserId: userId,
          name: `User Pending Authorization (${payload.email})`,
        });
      },

      [DomainEvent.USER_UPDATED]: async ({ entityId, payload }) => {
        if (payload.status === Status.pendingAuthorization) return;

        const task = await this.repo.findByTypeAndRelatedUserIdCompanyWide({
          type: this.taskType,
          relatedUserId: entityId,
        });

        if (task) await this.repo.deleteById({ id: task.id });
      },
    };
  }
}
