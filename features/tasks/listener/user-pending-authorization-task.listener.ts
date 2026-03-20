import { TaskType, Status } from "@/generated/prisma";

import { TaskService } from "../task.service";

import { DomainEvent } from "@/features/event/domain-events";
import { BaseTaskListener } from "@/features/tasks/listener/base-task.listener";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

@TenantScoped
export class UserPendingAuthorizationTaskListener extends BaseTaskListener {
  constructor(private taskService: TaskService) {
    super(TaskType.userPendingAuthorization);
  }

  protected registerEventHandlers(): void {
    this.onEvent(DomainEvent.USER_REGISTERED, async ({ userId, payload }) => {
      if (!payload?.isNewCompany) {
        await this.taskService.create({
          type: this.taskType,
          relatedUserId: userId,
          name: `User Pending Authorization (${payload.email})`,
        });
      }
    });

    this.onEvent(DomainEvent.USER_UPDATED, async ({ entityId, payload }) => {
      if (payload.status === Status.pendingAuthorization) return;

      const task = await this.taskService.findByTypeAndRelatedUserId({
        type: this.taskType,
        relatedUserId: entityId,
      });

      if (task) await this.taskService.delete({ id: task.id });
    });
  }
}
