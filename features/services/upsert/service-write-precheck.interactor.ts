import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { CreateServiceData } from "./create-service.interactor";
import type { UpdateServiceData } from "./update-service.interactor";
import type { CreateManyServicesData } from "./create-many-services.interactor";
import type { UpdateManyServicesData } from "./update-many-services.interactor";
import type { DeleteServiceData } from "../delete/delete-service.interactor";
import type { DeleteManyServicesData } from "../delete/delete-many-services.interactor";

import { Resource, EntityType } from "@/generated/prisma";

export class ServiceWritePrecheckInteractor {
  constructor(
    private userValidator: ValidateUserIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
    private serviceValidator: ValidateServiceIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
  ) {}

  async create(data: CreateServiceData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.service,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.services, ctx),
    ]);
  }

  async update(data: UpdateServiceData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.serviceValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.service,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.services, ctx),
    ]);
  }

  async createMany(data: CreateManyServicesData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.userValidator.invoke(
        data.services.map((service, i) => ({ ids: service.userIds, path: ["services", i, "userIds"] })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.services.map((service, i) => ({ ids: service.dealIds, path: ["services", i, "dealIds"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.services.map((service, i) => ({ ids: service.taskIds, path: ["services", i, "taskIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.services.map((service, i) => ({
          values: service.customFieldValues,
          path: ["services", i, "customFieldValues"],
        })),
        EntityType.service,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.services.map((service, i) => ({ userIds: service.userIds, path: ["services", i, "userIds"] })),
        Resource.services,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyServicesData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.serviceValidator.invoke(
        data.services.map((service, i) => ({ ids: service.id, path: ["services", i, "id"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.services.map((service, i) => ({ ids: service.userIds, path: ["services", i, "userIds"] })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.services.map((service, i) => ({ ids: service.dealIds, path: ["services", i, "dealIds"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.services.map((service, i) => ({ ids: service.taskIds, path: ["services", i, "taskIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.services.map((service, i) => ({
          values: service.customFieldValues,
          path: ["services", i, "customFieldValues"],
        })),
        EntityType.service,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.services.map((service, i) => ({ userIds: service.userIds, path: ["services", i, "userIds"] })),
        Resource.services,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteServiceData, ctx: z.RefinementCtx) {
    await this.serviceValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async deleteMany(data: DeleteManyServicesData, ctx: z.RefinementCtx) {
    await this.serviceValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx);
  }
}
