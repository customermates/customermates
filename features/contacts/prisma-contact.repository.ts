import type { RepoArgs } from "@/core/utils/types";
import type { GetWidgetFilterableFieldsContactRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { GetUnscopedContactRepo } from "./get-unscoped-contact.repo";
import type { GetContactsRepo } from "./get/get-contacts.interactor";
import type { GetContactsConfigurationRepo } from "./get/get-contacts-configuration.interactor";
import type { GetContactByIdRepo } from "./get/get-contact-by-id.interactor";
import type { CreateContactRepo } from "./upsert/create-contact.repo";
import type { UpdateContactRepo } from "./upsert/update-contact.repo";
import type { DeleteContactRepo } from "./delete/delete-contact.repo";
import type { FindContactsByIdsRepo } from "./find-contacts-by-ids.repo";

import { EntityType, Resource } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { type ContactDto } from "./contact.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { getCustomColumnRepo } from "@/core/app-di";

export class PrismaContactRepo
  extends BaseRepository<Prisma.ContactWhereInput>
  implements
    GetContactsRepo,
    GetContactByIdRepo,
    CreateContactRepo,
    UpdateContactRepo,
    DeleteContactRepo,
    GetWidgetFilterableFieldsContactRepo,
    GetContactsConfigurationRepo,
    FindContactsByIdsRepo,
    GetUnscopedContactRepo
{
  private get userScopedSelect() {
    return {
      id: true,
      firstName: true,
      lastName: true,
      emails: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      organizations: {
        where: { organization: this.accessWhere("organization") },
        select: { organization: { select: { id: true, name: true } } },
      },
      users: {
        where: { user: this.accessWhere("user") },
        select: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
      },
      deals: {
        where: { deal: this.accessWhere("deal") },
        select: { deal: { select: { id: true, name: true } } },
      },
      tasks: {
        where: { task: this.accessWhere("task") },
        select: { task: { select: { id: true, name: true, type: true } } },
      },
      customFieldValues: {
        select: {
          columnId: true,
          value: true,
        },
      },
    } as const;
  }

  private get companyScopedSelect() {
    return {
      ...this.userScopedSelect,
      organizations: { select: this.userScopedSelect.organizations.select },
      users: { select: this.userScopedSelect.users.select },
      deals: { select: this.userScopedSelect.deals.select },
      tasks: { select: this.userScopedSelect.tasks.select },
    };
  }

  getSearchableFields() {
    return [
      { field: "firstName" },
      { field: "lastName" },
      { field: "emailsText" },
      { field: "organizations.organization.name" },
    ];
  }

  getArrayFields() {
    return new Set(["emails"]);
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["firstName", "lastName"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.contacts)) return [];

    const customFields = await getCustomColumnRepo().getFilterableCustomFields(EntityType.contact);

    const filterFields = [];

    if (this.canAccess(Resource.organizations)) {
      filterFields.push({
        field: FilterFieldKey.organizationIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.organizationIds],
      });
    }

    if (this.canAccess(Resource.deals)) {
      filterFields.push({
        field: FilterFieldKey.dealIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.dealIds],
      });
    }

    if (this.canAccess(Resource.tasks)) {
      filterFields.push({
        field: FilterFieldKey.taskIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.taskIds],
      });
    }

    return [
      ...filterFields,
      ...customFields,
      { field: FilterFieldKey.emails, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.emails] },
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ];
  }

  async getCustomColumns() {
    return await getCustomColumnRepo().findByEntityType(EntityType.contact);
  }

  async getContactById(id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        ...this.accessWhere("contact"),
      },
      select: this.userScopedSelect,
    });

    if (!contact) return null;

    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };
  }

  async getOrThrowUnscoped(id: string) {
    const { companyId } = this.user;

    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id, companyId },
      select: this.companyScopedSelect,
    });

    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };
  }

  async getManyOrThrowUnscoped(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (contacts.length !== uniqueIds.length) throw new Error("One or more contacts not found");

    return contacts.map((contact) => ({
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    }));
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "contact",
      baseWhere: this.accessWhere("contact"),
      select: this.userScopedSelect,
      params,
      map: (contact: Prisma.ContactGetPayload<{ select: PrismaContactRepo["userScopedSelect"] }>) => ({
        ...contact,
        organizations: contact.organizations.map((it) => it.organization),
        users: contact.users.map((it) => it.user),
        deals: contact.deals.map((it) => it.deal),
        tasks: contact.tasks.map((it) => it.task),
      }),
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("contact"));

    return this.prisma.contact.count({ where });
  }

  @Transaction
  async createContactOrThrow(args: RepoArgs<CreateContactRepo, "createContactOrThrow">) {
    const { companyId } = this.user;
    const { organizationIds, userIds, dealIds, taskIds, customFieldValues, firstName, lastName, emails, notes } = args;

    const data = {
      firstName,
      lastName,
      emails,
      notes,
      companyId,
    };

    const contact = await this.prisma.contact.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (organizationIds.length > 0) {
      promises.push(
        this.prisma.contactOrganization.createMany({
          data: organizationIds.map((organizationId) => ({
            contactId: contact.id,
            organizationId,
            companyId,
          })),
        }),
      );
    }

    if (userIds.length > 0) {
      promises.push(
        this.prisma.contactUser.createMany({
          data: userIds.map((userId) => ({
            contactId: contact.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (dealIds.length > 0) {
      promises.push(
        this.prisma.dealContact.createMany({
          data: dealIds.map((dealId) => ({
            contactId: contact.id,
            dealId,
            companyId,
          })),
        }),
      );
    }

    if (taskIds.length > 0) {
      promises.push(
        this.prisma.taskContact.createMany({
          data: taskIds.map((taskId) => ({
            contactId: contact.id,
            taskId,
            companyId,
          })),
        }),
      );
    }

    promises.push(getCustomColumnRepo().writeValuesForCreate(EntityType.contact, contact.id, customFieldValues));

    await Promise.all(promises);

    const createdContact = await this.prisma.contact.findFirstOrThrow({
      where: { id: contact.id, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    const res = {
      ...createdContact,
      organizations: createdContact.organizations.map((it) => it.organization),
      users: createdContact.users.map((it) => it.user),
      deals: createdContact.deals.map((it) => it.deal),
      tasks: createdContact.tasks.map((it) => it.task),
    };

    return res;
  }

  @Transaction
  async updateContactOrThrow(args: RepoArgs<UpdateContactRepo, "updateContactOrThrow">) {
    const { companyId } = this.user;
    const { id, organizationIds, userIds, dealIds, taskIds, customFieldValues, ...contactData } = args;

    const data: Prisma.ContactUpdateManyArgs["data"] = { companyId };

    if (contactData.firstName !== undefined) data.firstName = contactData.firstName;
    if (contactData.lastName !== undefined) data.lastName = contactData.lastName;
    if (contactData.emails != null) data.emails = contactData.emails;
    if (contactData.notes !== undefined) data.notes = contactData.notes;

    await this.prisma.contact.updateMany({
      where: { id, ...this.accessWhere("contact") },
      data,
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (organizationIds !== undefined) {
      deletePromises.push(
        this.prisma.contactOrganization.deleteMany({
          where: { contactId: id, companyId, organization: this.accessWhere("organization") },
        }),
      );

      if (organizationIds !== null && organizationIds.length > 0) {
        createPromises.push(
          this.prisma.contactOrganization.createMany({
            data: organizationIds.map((organizationId) => ({
              contactId: id,
              organizationId,
              companyId,
            })),
          }),
        );
      }
    }

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.contactUser.deleteMany({
          where: { contactId: id, companyId, user: { is: this.accessWhere("user") } },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.contactUser.createMany({
            data: userIds.map((userId) => ({
              contactId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (dealIds !== undefined) {
      deletePromises.push(
        this.prisma.dealContact.deleteMany({
          where: { contactId: id, companyId, deal: this.accessWhere("deal") },
        }),
      );

      if (dealIds !== null && dealIds.length > 0) {
        createPromises.push(
          this.prisma.dealContact.createMany({
            data: dealIds.map((dealId) => ({
              contactId: id,
              dealId,
              companyId,
            })),
          }),
        );
      }
    }

    if (taskIds !== undefined) {
      deletePromises.push(
        this.prisma.taskContact.deleteMany({
          where: { contactId: id, companyId, task: this.accessWhere("task") },
        }),
      );

      if (taskIds !== null && taskIds.length > 0) {
        createPromises.push(
          this.prisma.taskContact.createMany({
            data: taskIds.map((taskId) => ({
              contactId: id,
              taskId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(getCustomColumnRepo().deleteValuesForEntity(EntityType.contact, id));
      else createPromises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.contact, id, customFieldValues));
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    const updatedContact = await this.prisma.contact.findFirstOrThrow({
      where: { id, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    const res = {
      ...updatedContact,
      organizations: updatedContact.organizations.map((it) => it.organization),
      users: updatedContact.users.map((it) => it.user),
      deals: updatedContact.deals.map((it) => it.deal),
      tasks: updatedContact.tasks.map((it) => it.task),
    };

    return res;
  }

  @Transaction
  async deleteContactOrThrow(id: string) {
    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id, ...this.accessWhere("contact") },
      select: this.userScopedSelect,
    });

    const contactDto: ContactDto = {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
      tasks: contact.tasks.map((it) => it.task),
    };

    await this.prisma.contact.deleteMany({ where: { id, ...this.accessWhere("contact") } });

    return contactDto;
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const contacts = await this.prisma.contact.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("contact"),
      },
      select: { id: true },
    });

    return new Set(contacts.map((contact) => contact.id));
  }
}
