import type { TaskService } from "../task.service";
import type { DomainEventHandlers } from "@/features/tasks/listener/base-task.listener";

import { TaskType } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { BaseTaskListener } from "@/features/tasks/listener/base-task.listener";

export class CompanyOnboardingTaskListener extends BaseTaskListener {
  readonly handlers: DomainEventHandlers;

  constructor(private taskService: TaskService) {
    super(TaskType.companyOnboarding);

    this.handlers = {
      [DomainEvent.USER_REGISTERED]: async ({ userId, payload }) => {
        if (!payload?.isNewCompany) return;

        await this.taskService.create({
          type: this.taskType,
          userIds: [userId],
          name: "Finalize Company Onboarding",
        });
      },

      [DomainEvent.COMPANY_UPDATED]: async () => {
        const task = await this.taskService.findByType({ type: this.taskType });

        if (task) await this.taskService.delete({ id: task.id });
      },
    };
  }
}
