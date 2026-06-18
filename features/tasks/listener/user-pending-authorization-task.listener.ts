import type { TaskService } from "../task.service";
import type { DomainEventHandlers } from "@/features/event/domain-event.listener";

import { TaskType, Status } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";

export class UserPendingAuthorizationTaskListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;
  private readonly taskType = TaskType.userPendingAuthorization;

  constructor(private taskService: TaskService) {
    super();

    this.handlers = {
      [DomainEvent.USER_REGISTERED]: async ({ userId, payload }) => {
        if (payload?.isNewCompany) return;

        await this.taskService.create({
          type: this.taskType,
          relatedUserId: userId,
          name: `User Pending Authorization (${payload.email})`,
        });
      },

      [DomainEvent.USER_UPDATED]: async ({ entityId, payload }) => {
        if (payload.status === Status.pendingAuthorization) return;

        const task = await this.taskService.findByTypeAndRelatedUserId({
          type: this.taskType,
          relatedUserId: entityId,
        });

        if (task) await this.taskService.delete({ id: task.id });
      },
    };
  }
}
