import { TaskType } from "@/generated/prisma";

import { TaskService } from "../task.service";

import { DomainEvent } from "@/features/event/domain-events";
import { BaseTaskListener } from "@/features/tasks/listener/base-task.listener";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

@TenantScoped
export class CompanyOnboardingTaskListener extends BaseTaskListener {
  constructor(private taskService: TaskService) {
    super(TaskType.companyOnboarding);
  }

  protected registerEventHandlers(): void {
    this.onEvent(DomainEvent.USER_REGISTERED, async ({ userId, payload }) => {
      if (payload?.isNewCompany) {
        await this.taskService.create({
          type: this.taskType,
          userIds: [userId],
          name: "Finalize Company Onboarding",
        });
      }
    });

    this.onEvent(DomainEvent.COMPANY_UPDATED, async () => {
      const task = await this.taskService.findByType({ type: this.taskType });

      if (task) await this.taskService.delete({ id: task.id });
    });
  }
}
