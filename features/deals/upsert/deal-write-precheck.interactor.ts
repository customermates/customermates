import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { CreateDealData } from "./create-deal.interactor";
import type { UpdateDealData } from "./update-deal.interactor";
import type { CreateManyDealsData } from "./create-many-deals.interactor";
import type { UpdateManyDealsData } from "./update-many-deals.interactor";
import type { DeleteDealData } from "../delete/delete-deal.interactor";
import type { DeleteManyDealsData } from "../delete/delete-many-deals.interactor";

import { Resource, EntityType } from "@/generated/prisma";

import { unique } from "@/core/utils/unique";

export class DealWritePrecheckInteractor {
  constructor(
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private serviceValidator: ValidateServiceIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
  ) {}

  async create(data: CreateDealData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.serviceValidator.invoke([{ ids: data.services.map((s) => s.serviceId), path: ["services"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.deals, ctx),
    ]);
  }

  async update(data: UpdateDealData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.serviceValidator.invoke([{ ids: data.services?.map((s) => s.serviceId), path: ["services"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.deals, ctx),
    ]);
  }

  async createMany(data: CreateManyDealsData, ctx: z.RefinementCtx) {
    const allServiceIds = unique(data.deals.flatMap((deal) => deal.services.map((s) => s.serviceId)));
    await Promise.all([
      this.organizationValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.organizationIds, path: ["deals", i, "organizationIds"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.userIds, path: ["deals", i, "userIds"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.contactIds, path: ["deals", i, "contactIds"] })),
        ctx,
      ),
      this.serviceValidator.invoke(
        data.deals.map((deal, i) => ({ ids: allServiceIds, path: ["deals", i, "services"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.taskIds, path: ["deals", i, "taskIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.deals.map((deal, i) => ({ values: deal.customFieldValues, path: ["deals", i, "customFieldValues"] })),
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.deals.map((deal, i) => ({ userIds: deal.userIds, path: ["deals", i, "userIds"] })),
        Resource.deals,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyDealsData, ctx: z.RefinementCtx) {
    const allServiceIds = unique(data.deals.flatMap((deal) => deal.services?.map((s) => s.serviceId) ?? []));
    await Promise.all([
      this.dealValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.id, path: ["deals", i, "id"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.organizationIds, path: ["deals", i, "organizationIds"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.userIds, path: ["deals", i, "userIds"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.contactIds, path: ["deals", i, "contactIds"] })),
        ctx,
      ),
      this.serviceValidator.invoke(
        data.deals.map((deal, i) => ({ ids: allServiceIds, path: ["deals", i, "services"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.taskIds, path: ["deals", i, "taskIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.deals.map((deal, i) => ({ values: deal.customFieldValues, path: ["deals", i, "customFieldValues"] })),
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.deals.map((deal, i) => ({ userIds: deal.userIds, path: ["deals", i, "userIds"] })),
        Resource.deals,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteDealData, ctx: z.RefinementCtx) {
    await this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async deleteMany(data: DeleteManyDealsData, ctx: z.RefinementCtx) {
    await this.dealValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx);
  }
}
