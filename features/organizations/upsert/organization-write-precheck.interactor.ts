import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { CreateOrganizationData } from "./create-organization.interactor";
import type { UpdateOrganizationData } from "./update-organization.interactor";
import type { CreateManyOrganizationsData } from "./create-many-organizations.interactor";
import type { UpdateManyOrganizationsData } from "./update-many-organizations.interactor";
import type { DeleteOrganizationData } from "../delete/delete-organization.interactor";
import type { DeleteManyOrganizationsData } from "../delete/delete-many-organizations.interactor";

import { Resource, EntityType } from "@/generated/prisma";

export class OrganizationWritePrecheckInteractor {
  constructor(
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
  ) {}

  async create(data: CreateOrganizationData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.organization,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.organizations, ctx),
    ]);
  }

  async update(data: UpdateOrganizationData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.organizationValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.organization,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.organizations, ctx),
    ]);
  }

  async createMany(data: CreateManyOrganizationsData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.contactValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.contactIds,
          path: ["organizations", i, "contactIds"],
        })),
        ctx,
      ),
      this.userValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.userIds,
          path: ["organizations", i, "userIds"],
        })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.dealIds,
          path: ["organizations", i, "dealIds"],
        })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.taskIds,
          path: ["organizations", i, "taskIds"],
        })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.organizations.map((organization, i) => ({
          values: organization.customFieldValues,
          path: ["organizations", i, "customFieldValues"],
        })),
        EntityType.organization,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.organizations.map((organization, i) => ({
          userIds: organization.userIds,
          path: ["organizations", i, "userIds"],
        })),
        Resource.organizations,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyOrganizationsData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.organizationValidator.invoke(
        data.organizations.map((organization, i) => ({ ids: organization.id, path: ["organizations", i, "id"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.contactIds,
          path: ["organizations", i, "contactIds"],
        })),
        ctx,
      ),
      this.userValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.userIds,
          path: ["organizations", i, "userIds"],
        })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.dealIds,
          path: ["organizations", i, "dealIds"],
        })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.organizations.map((organization, i) => ({
          ids: organization.taskIds,
          path: ["organizations", i, "taskIds"],
        })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.organizations.map((organization, i) => ({
          values: organization.customFieldValues,
          path: ["organizations", i, "customFieldValues"],
        })),
        EntityType.organization,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.organizations.map((organization, i) => ({
          userIds: organization.userIds,
          path: ["organizations", i, "userIds"],
        })),
        Resource.organizations,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteOrganizationData, ctx: z.RefinementCtx) {
    await this.organizationValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async deleteMany(data: DeleteManyOrganizationsData, ctx: z.RefinementCtx) {
    await this.organizationValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx);
  }
}
