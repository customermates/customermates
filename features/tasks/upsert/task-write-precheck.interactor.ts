import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { ValidateSystemTaskIdsInteractor } from "./validate-system-task-ids.interactor";
import type { ValidateSystemTaskNameInteractor } from "./validate-system-task-name.interactor";
import type { CreateTaskData } from "./create-task.interactor";
import type { UpdateTaskData } from "./update-task.interactor";
import type { CreateManyTasksData } from "./create-many-tasks.interactor";
import type { UpdateManyTasksData } from "./update-many-tasks.interactor";
import type { DeleteTaskData } from "../delete/delete-task.interactor";
import type { DeleteManyTasksData } from "../delete/delete-many-tasks.interactor";

import { Resource, EntityType } from "@/generated/prisma";

export class TaskWritePrecheckInteractor {
  constructor(
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private serviceValidator: ValidateServiceIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
    private systemTaskNameValidator: ValidateSystemTaskNameInteractor,
    private systemTaskIdsValidator: ValidateSystemTaskIdsInteractor,
  ) {}

  async create(data: CreateTaskData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.serviceValidator.invoke([{ ids: data.serviceIds, path: ["serviceIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.task,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.tasks, ctx),
    ]);
  }

  async update(data: UpdateTaskData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.taskValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.systemTaskNameValidator.invoke([{ task: data, path: [] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.serviceValidator.invoke([{ ids: data.serviceIds, path: ["serviceIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.task,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.tasks, ctx),
    ]);
  }

  async createMany(data: CreateManyTasksData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.userValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.userIds, path: ["tasks", i, "userIds"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.contactIds, path: ["tasks", i, "contactIds"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.organizationIds, path: ["tasks", i, "organizationIds"] })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.dealIds, path: ["tasks", i, "dealIds"] })),
        ctx,
      ),
      this.serviceValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.serviceIds, path: ["tasks", i, "serviceIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.tasks.map((task, i) => ({ values: task.customFieldValues, path: ["tasks", i, "customFieldValues"] })),
        EntityType.task,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.tasks.map((task, i) => ({ userIds: task.userIds, path: ["tasks", i, "userIds"] })),
        Resource.tasks,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyTasksData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.taskValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.id, path: ["tasks", i, "id"] })),
        ctx,
      ),
      this.systemTaskNameValidator.invoke(
        data.tasks.map((task, i) => ({ task, path: ["tasks", i] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.userIds, path: ["tasks", i, "userIds"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.contactIds, path: ["tasks", i, "contactIds"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.organizationIds, path: ["tasks", i, "organizationIds"] })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.dealIds, path: ["tasks", i, "dealIds"] })),
        ctx,
      ),
      this.serviceValidator.invoke(
        data.tasks.map((task, i) => ({ ids: task.serviceIds, path: ["tasks", i, "serviceIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.tasks.map((task, i) => ({ values: task.customFieldValues, path: ["tasks", i, "customFieldValues"] })),
        EntityType.task,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.tasks.map((task, i) => ({ userIds: task.userIds, path: ["tasks", i, "userIds"] })),
        Resource.tasks,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteTaskData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.taskValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.systemTaskIdsValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
    ]);
  }

  async deleteMany(data: DeleteManyTasksData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.taskValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx),
      this.systemTaskIdsValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx),
    ]);
  }
}
