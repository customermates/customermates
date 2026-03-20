import type { RepoArgs } from "@/core/utils/types";

import { EntityType, Prisma, Resource } from "@/generated/prisma";

import { PrismaCustomColumnRepo } from "../custom-column/prisma-custom-column.repository";
import { GetWidgetFilterableFieldsContactRepo } from "../widget/get-widget-filterable-fields.interactor";

import { GetContactsRepo } from "./get/get-contacts.interactor";
import { GetContactsConfigurationRepo } from "./get/get-contacts-configuration.interactor";
import { GetContactByIdRepo } from "./get/get-contact-by-id.interactor";
import { CreateContactRepo } from "./upsert/create-contact.repo";
import { UpdateContactRepo } from "./upsert/update-contact.repo";
import { DeleteContactRepo } from "./delete/delete-contact.repo";
import { FindContactsByIdsRepo } from "./find-contacts-by-ids.repo";
import { type ContactDto } from "./contact.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Repository } from "@/core/decorators/repository.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { di } from "@/core/dependency-injection/container";

@Repository
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
    FindContactsByIdsRepo
{
  private get customColumnRepo() {
    return di.get(PrismaCustomColumnRepo);
  }

  private get baseSelect() {
    return {
      id: true,
      firstName: true,
      lastName: true,
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
      customFieldValues: {
        select: {
          columnId: true,
          value: true,
        },
      },
    } as const;
  }

  getSearchableFields() {
    return [{ field: "firstName" }, { field: "lastName" }, { field: "organizations.organization.name" }];
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

    const customFields = await this.customColumnRepo.getFilterableCustomFields(EntityType.contact);

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

    return [
      ...filterFields,
      ...customFields,
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ];
  }

  async getCustomColumns() {
    return await this.customColumnRepo.findByEntityType(EntityType.contact);
  }

  async getContactById(id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        ...this.accessWhere("contact"),
      },
      select: this.baseSelect,
    });

    if (!contact) return null;

    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
    };
  }

  async getContactByIdOrThrow(id: string) {
    const contact = await this.prisma.contact.findFirstOrThrow({
      where: {
        id,
        ...this.accessWhere("contact"),
      },
      select: this.baseSelect,
    });

    return {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
    };
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, this.accessWhere("contact"));

    const contacts = await this.prisma.contact.findMany({
      ...args,
      select: this.baseSelect,
    });

    return contacts.map((contact) => ({
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
    }));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("contact"));

    return this.prisma.contact.count({ where });
  }

  @Transaction
  async createContactOrThrow(args: RepoArgs<CreateContactRepo, "createContactOrThrow">) {
    const { companyId } = this.user;
    const { organizationIds, userIds, dealIds, customFieldValues, firstName, lastName, notes } = args;

    const data = {
      firstName,
      lastName,
      notes: notes,
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

    if (customFieldValues.length > 0)
      promises.push(this.customColumnRepo.replaceValuesForEntity(EntityType.contact, contact.id, customFieldValues));

    await Promise.all(promises);

    const createdContact = await this.prisma.contact.findFirstOrThrow({
      where: { id: contact.id, ...this.accessWhere("contact") },
      select: this.baseSelect,
    });

    const res = {
      ...createdContact,
      organizations: createdContact.organizations.map((it) => it.organization),
      users: createdContact.users.map((it) => it.user),
      deals: createdContact.deals.map((it) => it.deal),
    };

    return res;
  }

  @Transaction
  async updateContactOrThrow(args: RepoArgs<UpdateContactRepo, "updateContactOrThrow">) {
    const { companyId } = this.user;
    const { id, organizationIds, userIds, dealIds, customFieldValues, ...contactData } = args;

    const data: Prisma.ContactUpdateManyArgs["data"] = { companyId };

    if (contactData.firstName !== undefined) data.firstName = contactData.firstName;
    if (contactData.lastName !== undefined) data.lastName = contactData.lastName;
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

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(this.customColumnRepo.deleteValuesForEntity(EntityType.contact, id));
      else createPromises.push(this.customColumnRepo.replaceValuesForEntity(EntityType.contact, id, customFieldValues));
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    const updatedContact = await this.prisma.contact.findFirstOrThrow({
      where: { id, ...this.accessWhere("contact") },
      select: this.baseSelect,
    });

    const res = {
      ...updatedContact,
      organizations: updatedContact.organizations.map((it) => it.organization),
      users: updatedContact.users.map((it) => it.user),
      deals: updatedContact.deals.map((it) => it.deal),
    };

    return res;
  }

  @Transaction
  async deleteContactOrThrow(id: RepoArgs<DeleteContactRepo, "deleteContactOrThrow">) {
    const contact = await this.prisma.contact.findFirstOrThrow({
      where: { id, ...this.accessWhere("contact") },
      select: this.baseSelect,
    });

    const contactDto: ContactDto = {
      ...contact,
      organizations: contact.organizations.map((it) => it.organization),
      users: contact.users.map((it) => it.user),
      deals: contact.deals.map((it) => it.deal),
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
