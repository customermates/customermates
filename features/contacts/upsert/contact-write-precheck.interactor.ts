import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { ValidateIdentifierConflictsInteractor } from "./validate-identifier-conflicts.interactor";
import type { FindContactsByIdsRepo } from "../find-contacts-by-ids.repo";
import type { CreateContactData } from "./create-contact.interactor";
import type { UpdateContactData } from "./update-contact.interactor";
import type { CreateManyContactsData } from "./create-many-contacts.interactor";
import type { UpdateManyContactsData } from "./update-many-contacts.interactor";
import type { DeleteContactData } from "../delete/delete-contact.interactor";
import type { DeleteManyContactsData } from "../delete/delete-many-contacts.interactor";

import { Resource, EntityType } from "@/generated/prisma";

export class ContactWritePrecheckInteractor {
  constructor(
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
    private identifierConflictsValidator: ValidateIdentifierConflictsInteractor,
    private contactByIds: FindContactsByIdsRepo,
  ) {}

  async create(data: CreateContactData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.contact,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.contacts, ctx),
      this.identifierConflictsValidator.invoke(
        [{ selfContactId: undefined, identifiers: data.identifiers }],
        ctx,
        () => ["identifiers"],
      ),
    ]);
  }

  async update(data: UpdateContactData, ctx: z.RefinementCtx) {
    const resolved = await this.contactByIds.findIds(new Set([data.id]));

    await Promise.all([
      this.contactValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.dealValidator.invoke([{ ids: data.dealIds, path: ["dealIds"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.contact,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.contacts, ctx),
      this.identifierConflictsValidator.invoke(
        [{ selfContactId: resolved.get(data.id), identifiers: data.identifiers }],
        ctx,
        () => ["identifiers"],
      ),
    ]);
  }

  async createMany(data: CreateManyContactsData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.organizationValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.organizationIds, path: ["contacts", i, "organizationIds"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.userIds, path: ["contacts", i, "userIds"] })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.dealIds, path: ["contacts", i, "dealIds"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.taskIds, path: ["contacts", i, "taskIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.contacts.map((contact, i) => ({
          values: contact.customFieldValues,
          path: ["contacts", i, "customFieldValues"],
        })),
        EntityType.contact,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.contacts.map((contact, i) => ({ userIds: contact.userIds, path: ["contacts", i, "userIds"] })),
        Resource.contacts,
        ctx,
      ),
      this.identifierConflictsValidator.invoke(
        data.contacts.map((contact, i) => ({ selfContactId: String(i), identifiers: contact.identifiers })),
        ctx,
        (i) => ["contacts", i, "identifiers"],
      ),
    ]);
  }

  async updateMany(data: UpdateManyContactsData, ctx: z.RefinementCtx) {
    const resolved = await this.contactByIds.findIds(new Set(data.contacts.map((contact) => contact.id)));

    await Promise.all([
      this.contactValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.id, path: ["contacts", i, "id"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.organizationIds, path: ["contacts", i, "organizationIds"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.userIds, path: ["contacts", i, "userIds"] })),
        ctx,
      ),
      this.dealValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.dealIds, path: ["contacts", i, "dealIds"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.contacts.map((contact, i) => ({ ids: contact.taskIds, path: ["contacts", i, "taskIds"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.contacts.map((contact, i) => ({
          values: contact.customFieldValues,
          path: ["contacts", i, "customFieldValues"],
        })),
        EntityType.contact,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.contacts.map((contact, i) => ({ userIds: contact.userIds, path: ["contacts", i, "userIds"] })),
        Resource.contacts,
        ctx,
      ),
      this.identifierConflictsValidator.invoke(
        data.contacts.map((contact) => ({ selfContactId: resolved.get(contact.id), identifiers: contact.identifiers })),
        ctx,
        (i) => ["contacts", i, "identifiers"],
      ),
    ]);
  }

  async delete(data: DeleteContactData, ctx: z.RefinementCtx) {
    await this.contactValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async deleteMany(data: DeleteManyContactsData, ctx: z.RefinementCtx) {
    await this.contactValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx);
  }
}
