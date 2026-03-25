import type { RepoArgs } from "@/core/utils/types";

import { EntityType, Prisma, Resource } from "@/generated/prisma";

import { PrismaCustomColumnRepo } from "../custom-column/prisma-custom-column.repository";
import { GetWidgetFilterableFieldsOrganizationRepo } from "../widget/get-widget-filterable-fields.interactor";

import { GetUnscopedOrganizationRepo } from "./get-unscoped-organization.repo";
import { GetOrganizationsRepo } from "./get/get-organizations.interactor";
import { GetOrganizationsConfigurationRepo } from "./get/get-organizations-configuration.interactor";
import { GetOrganizationByIdRepo } from "./get/get-organization-by-id.interactor";
import { CreateOrganizationRepo } from "./upsert/create-organization.repo";
import { UpdateOrganizationRepo } from "./upsert/update-organization.repo";
import { DeleteOrganizationRepo } from "./delete/delete-organization.repo";
import { FindOrganizationsByIdsRepo } from "./find-organizations-by-ids.repo";
import { type OrganizationDto } from "./organization.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Repository } from "@/core/decorators/repository.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { di } from "@/core/dependency-injection/container";

@Repository
export class PrismaOrganizationRepo
  extends BaseRepository
  implements
    GetOrganizationsRepo,
    GetOrganizationsConfigurationRepo,
    GetOrganizationByIdRepo,
    CreateOrganizationRepo,
    UpdateOrganizationRepo,
    DeleteOrganizationRepo,
    GetWidgetFilterableFieldsOrganizationRepo,
    FindOrganizationsByIdsRepo,
    GetUnscopedOrganizationRepo
{
  private get customColumnRepo() {
    return di.get(PrismaCustomColumnRepo);
  }

  private get userScopedSelect() {
    return {
      id: true,
      name: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      contacts: {
        where: { contact: this.accessWhere("contact") },
        select: { contact: { select: { id: true, firstName: true, lastName: true } } },
      },
      users: {
        where: { user: { is: this.accessWhere("user") } },
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

  private get companyScopedSelect() {
    return {
      ...this.userScopedSelect,
      contacts: { select: this.userScopedSelect.contacts.select },
      users: { select: this.userScopedSelect.users.select },
      deals: { select: this.userScopedSelect.deals.select },
    };
  }

  getSearchableFields() {
    return [{ field: "name" }, { field: "contacts.contact.firstName" }, { field: "contacts.contact.lastName" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.organizations)) return [];

    const customFields = await this.customColumnRepo.getFilterableCustomFields(EntityType.organization);

    const filterFields = [];

    if (this.canAccess(Resource.contacts)) {
      filterFields.push({
        field: FilterFieldKey.contactIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.contactIds],
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

  async getOrganizationById(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id,
        ...this.accessWhere("organization"),
      },
      select: this.userScopedSelect,
    });

    if (!organization) return null;

    return {
      ...organization,
      contacts: organization.contacts.map((it) => it.contact),
      users: organization.users.map((it) => it.user),
      deals: organization.deals.map((it) => it.deal),
    };
  }

  async getOrThrowUnscoped(id: string) {
    const { companyId } = this.user;

    const organization = await this.prisma.organization.findFirstOrThrow({
      where: { id, companyId },
      select: this.companyScopedSelect,
    });

    return {
      ...organization,
      contacts: organization.contacts.map((it) => it.contact),
      users: organization.users.map((it) => it.user),
      deals: organization.deals.map((it) => it.deal),
    };
  }

  async getManyOrThrowUnscoped(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (organizations.length !== uniqueIds.length) throw new Error("One or more organizations not found");

    return organizations.map((organization) => ({
      ...organization,
      contacts: organization.contacts.map((it) => it.contact),
      users: organization.users.map((it) => it.user),
      deals: organization.deals.map((it) => it.deal),
    }));
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, this.accessWhere("organization"));

    const organizations = await this.prisma.organization.findMany({
      ...args,
      select: this.userScopedSelect,
    });

    return organizations.map((organization) => ({
      ...organization,
      contacts: organization.contacts.map((it) => it.contact),
      users: organization.users.map((it) => it.user),
      deals: organization.deals.map((it) => it.deal),
    }));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("organization"));

    return this.prisma.organization.count({ where });
  }

  async getCustomColumns() {
    return this.customColumnRepo.findByEntityType(EntityType.organization);
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const organizations = await this.prisma.organization.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("organization"),
      },
      select: { id: true },
    });

    return new Set(organizations.map((org) => org.id));
  }

  @Transaction
  async createOrganizationOrThrow(args: RepoArgs<CreateOrganizationRepo, "createOrganizationOrThrow">) {
    const { companyId } = this.user;
    const { contactIds, userIds, dealIds, customFieldValues, name, notes } = args;

    const data = {
      name,
      notes: notes,
      companyId,
    };

    const organization = await this.prisma.organization.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (contactIds.length > 0) {
      promises.push(
        this.prisma.contactOrganization.createMany({
          data: contactIds.map((contactId) => ({
            contactId,
            organizationId: organization.id,
            companyId,
          })),
        }),
      );
    }

    if (userIds.length > 0) {
      promises.push(
        this.prisma.organizationUser.createMany({
          data: userIds.map((userId) => ({
            organizationId: organization.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (dealIds.length > 0) {
      promises.push(
        this.prisma.dealOrganization.createMany({
          data: dealIds.map((dealId) => ({
            organizationId: organization.id,
            dealId,
            companyId,
          })),
        }),
      );
    }

    if (customFieldValues.length > 0) {
      promises.push(
        this.customColumnRepo.replaceValuesForEntity(EntityType.organization, organization.id, customFieldValues),
      );
    }

    await Promise.all(promises);

    const createdOrganization = await this.prisma.organization.findFirstOrThrow({
      where: { id: organization.id, ...this.accessWhere("organization") },
      select: this.userScopedSelect,
    });

    const res = {
      ...createdOrganization,
      contacts: createdOrganization.contacts.map((it) => it.contact),
      users: createdOrganization.users.map((it) => it.user),
      deals: createdOrganization.deals.map((it) => it.deal),
    };

    return res;
  }

  @Transaction
  async updateOrganizationOrThrow(args: RepoArgs<UpdateOrganizationRepo, "updateOrganizationOrThrow">) {
    const { companyId } = this.user;
    const { id, contactIds, userIds, dealIds, customFieldValues, ...organizationData } = args;

    const data: Prisma.OrganizationUpdateManyArgs["data"] = { companyId };

    if (organizationData.name !== undefined) data.name = organizationData.name;
    if (organizationData.notes !== undefined) data.notes = organizationData.notes;

    await this.prisma.organization.updateMany({
      where: { id, ...this.accessWhere("organization") },
      data,
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (contactIds !== undefined) {
      deletePromises.push(
        this.prisma.contactOrganization.deleteMany({
          where: { organizationId: id, companyId, contact: this.accessWhere("contact") },
        }),
      );

      if (contactIds !== null && contactIds.length > 0) {
        createPromises.push(
          this.prisma.contactOrganization.createMany({
            data: contactIds.map((contactId) => ({
              contactId,
              organizationId: id,
              companyId,
            })),
          }),
        );
      }
    }

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.organizationUser.deleteMany({
          where: { organizationId: id, companyId, user: { is: this.accessWhere("user") } },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.organizationUser.createMany({
            data: userIds.map((userId) => ({
              organizationId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (dealIds !== undefined) {
      deletePromises.push(
        this.prisma.dealOrganization.deleteMany({
          where: { organizationId: id, companyId, deal: this.accessWhere("deal") },
        }),
      );

      if (dealIds !== null && dealIds.length > 0) {
        createPromises.push(
          this.prisma.dealOrganization.createMany({
            data: dealIds.map((dealId) => ({
              organizationId: id,
              dealId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(this.customColumnRepo.deleteValuesForEntity(EntityType.organization, id));
      else {
        createPromises.push(
          this.customColumnRepo.replaceValuesForEntity(EntityType.organization, id, customFieldValues),
        );
      }
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    const updatedOrganization = await this.prisma.organization.findFirstOrThrow({
      where: { id, ...this.accessWhere("organization") },
      select: this.userScopedSelect,
    });

    const res = {
      ...updatedOrganization,
      contacts: updatedOrganization.contacts.map((it) => it.contact),
      users: updatedOrganization.users.map((it) => it.user),
      deals: updatedOrganization.deals.map((it) => it.deal),
    };

    return res;
  }

  @Transaction
  async deleteOrganizationOrThrow(id: string) {
    const organization = await this.prisma.organization.findFirstOrThrow({
      where: { id, ...this.accessWhere("organization") },
      select: this.userScopedSelect,
    });

    const organizationDto: OrganizationDto = {
      ...organization,
      contacts: organization.contacts.map((it) => it.contact),
      users: organization.users.map((it) => it.user),
      deals: organization.deals.map((it) => it.deal),
    };

    await this.prisma.organization.deleteMany({ where: { id, ...this.accessWhere("organization") } });

    return organizationDto;
  }
}
