import type { RepoArgs } from "@/core/utils/types";

import { EntityType, Prisma, Resource } from "@/generated/prisma";

import { PrismaCustomColumnRepo } from "../custom-column/prisma-custom-column.repository";
import { GetWidgetFilterableFieldsServiceRepo } from "../widget/get-widget-filterable-fields.interactor";

import { GetUnscopedServiceRepo } from "./get-unscoped-service.repo";
import { GetServicesRepo } from "./get/get-services.interactor";
import { GetServicesConfigurationRepo } from "./get/get-services-configuration.interactor";
import { GetServiceByIdRepo } from "./get/get-service-by-id.interactor";
import { CreateServiceRepo } from "./upsert/create-service.repo";
import { UpdateServiceRepo } from "./upsert/update-service.repo";
import { DeleteServiceRepo } from "./delete/delete-service.repo";
import { FindServicesByIdsRepo } from "./find-services-by-ids.repo";
import { type ServiceDto } from "./service.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Repository } from "@/core/decorators/repository.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { di } from "@/core/dependency-injection/container";

@Repository
export class PrismaServiceRepo
  extends BaseRepository
  implements
    GetServicesRepo,
    GetServicesConfigurationRepo,
    GetServiceByIdRepo,
    CreateServiceRepo,
    UpdateServiceRepo,
    DeleteServiceRepo,
    GetWidgetFilterableFieldsServiceRepo,
    FindServicesByIdsRepo,
    GetUnscopedServiceRepo
{
  private get customColumnRepo() {
    return di.get(PrismaCustomColumnRepo);
  }

  private get userScopedSelect() {
    return {
      id: true,
      name: true,
      amount: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
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
      users: { select: this.userScopedSelect.users.select },
      deals: { select: this.userScopedSelect.deals.select },
    };
  }

  getSearchableFields() {
    return [{ field: "name" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"] },
      { field: "amount", resolvedFields: ["amount"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.services)) return [];

    const customFields = await this.customColumnRepo.getFilterableCustomFields(EntityType.service);

    const filterFields = [];

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

  async getServiceById(id: string) {
    const service = await this.prisma.service.findFirst({
      where: {
        id,
        ...this.accessWhere("service"),
      },
      select: this.userScopedSelect,
    });

    if (!service) return null;

    return {
      ...service,
      users: service.users.map((it) => it.user),
      deals: service.deals.map((it) => it.deal),
    };
  }

  async getOrThrowUnscoped(id: string) {
    const { companyId } = this.user;

    const service = await this.prisma.service.findFirstOrThrow({
      where: { id, companyId },
      select: this.companyScopedSelect,
    });

    return {
      ...service,
      users: service.users.map((it) => it.user),
      deals: service.deals.map((it) => it.deal),
    };
  }

  async getManyOrThrowUnscoped(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const services = await this.prisma.service.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (services.length !== uniqueIds.length) throw new Error("One or more services not found");

    return services.map((service) => ({
      ...service,
      users: service.users.map((it) => it.user),
      deals: service.deals.map((it) => it.deal),
    }));
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, this.accessWhere("service"));

    const services = await this.prisma.service.findMany({
      ...args,
      select: this.userScopedSelect,
    });

    return services.map((service) => ({
      ...service,
      users: service.users.map((it) => it.user),
      deals: service.deals.map((it) => it.deal),
    }));
  }

  async getCount(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, this.accessWhere("service"));

    return await this.prisma.service.count({ where: args.where });
  }

  async getCustomColumns() {
    return this.customColumnRepo.findByEntityType(EntityType.service);
  }

  @Transaction
  async createServiceOrThrow(args: RepoArgs<CreateServiceRepo, "createServiceOrThrow">) {
    const { companyId } = this.user;
    const { userIds, dealIds, customFieldValues, name, amount, notes } = args;

    const data = {
      name,
      amount,
      notes: notes,
      companyId,
    };

    const service = await this.prisma.service.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (dealIds.length > 0) {
      promises.push(
        this.prisma.serviceDeal.createMany({
          data: dealIds.map((dealId) => ({
            serviceId: service.id,
            dealId,
            companyId,
            quantity: 1,
          })),
        }),
      );
    }

    if (userIds.length > 0) {
      promises.push(
        this.prisma.serviceUser.createMany({
          data: userIds.map((userId) => ({
            serviceId: service.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (customFieldValues.length > 0)
      promises.push(this.customColumnRepo.replaceValuesForEntity(EntityType.service, service.id, customFieldValues));

    await Promise.all(promises);

    if (dealIds.length > 0) await this.updateAffectedDealTotals(dealIds);

    const createdService = await this.prisma.service.findFirstOrThrow({
      where: { id: service.id, ...this.accessWhere("service") },
      select: this.userScopedSelect,
    });

    return {
      ...createdService,
      users: createdService.users.map((it) => it.user),
      deals: createdService.deals.map((it) => it.deal),
    };
  }

  @Transaction
  async updateServiceOrThrow(args: RepoArgs<UpdateServiceRepo, "updateServiceOrThrow">) {
    const { companyId } = this.user;
    const { id, userIds, dealIds, customFieldValues, ...serviceData } = args;

    const data: Prisma.ServiceUpdateManyArgs["data"] = { companyId };

    if (serviceData.name !== undefined) data.name = serviceData.name;
    if (serviceData.amount !== undefined) data.amount = serviceData.amount;
    if (serviceData.notes !== undefined) data.notes = serviceData.notes;

    await this.prisma.service.updateMany({
      where: { id, ...this.accessWhere("service") },
      data,
    });

    const existingServiceDeals = await this.prisma.serviceDeal.findMany({
      where: { serviceId: id, companyId, deal: this.accessWhere("deal") },
      select: { dealId: true, quantity: true },
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (dealIds !== undefined) {
      deletePromises.push(
        this.prisma.serviceDeal.deleteMany({
          where: { serviceId: id, companyId, deal: this.accessWhere("deal") },
        }),
      );

      if (dealIds !== null && dealIds.length > 0) {
        const existingQuantities = new Map(existingServiceDeals.map((sd) => [sd.dealId, sd.quantity]));

        createPromises.push(
          this.prisma.serviceDeal.createMany({
            data: dealIds.map((dealId) => ({
              serviceId: id,
              dealId,
              companyId,
              quantity: existingQuantities.get(dealId) ?? 1,
            })),
          }),
        );
      }
    }

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.serviceUser.deleteMany({
          where: { serviceId: id, companyId, user: { is: this.accessWhere("user") } },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.serviceUser.createMany({
            data: userIds.map((userId) => ({
              serviceId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(this.customColumnRepo.deleteValuesForEntity(EntityType.service, id));
      else createPromises.push(this.customColumnRepo.replaceValuesForEntity(EntityType.service, id, customFieldValues));
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    const affectedDealIds = Array.from(
      new Set([
        ...existingServiceDeals.map((sd) => sd.dealId),
        ...(dealIds !== undefined && dealIds !== null ? dealIds : []),
      ]),
    );
    if (affectedDealIds.length > 0) await this.updateAffectedDealTotals(affectedDealIds);

    const updatedService = await this.prisma.service.findFirstOrThrow({
      where: { id, ...this.accessWhere("service") },
      select: this.userScopedSelect,
    });

    return {
      ...updatedService,
      users: updatedService.users.map((it) => it.user),
      deals: updatedService.deals.map((it) => it.deal),
    };
  }

  @Transaction
  async deleteServiceOrThrow(id: string) {
    const { companyId } = this.user;

    const service = await this.prisma.service.findFirstOrThrow({
      where: { id, ...this.accessWhere("service") },
      select: this.userScopedSelect,
    });

    const serviceDto: ServiceDto = {
      ...service,
      users: service.users.map((it) => it.user),
      deals: service.deals.map((it) => it.deal),
    };

    const affectedDealIds = await this.prisma.serviceDeal
      .findMany({
        where: {
          serviceId: id,
          companyId,
        },
        select: { dealId: true },
      })
      .then((records) => records.map((record) => record.dealId));

    await this.prisma.service.deleteMany({ where: { id, ...this.accessWhere("service") } });

    if (affectedDealIds.length > 0) await this.updateAffectedDealTotals(affectedDealIds);

    return serviceDto;
  }

  private async updateAffectedDealTotals(dealIds: string[]) {
    if (dealIds.length === 0) return;

    const { companyId } = this.user;
    const uniqueDealIds = Array.from(new Set(dealIds));

    const [existingDeals, serviceDeals] = await Promise.all([
      this.prisma.deal.findMany({
        where: { id: { in: uniqueDealIds }, companyId },
        select: { id: true, totalValue: true, totalQuantity: true },
      }),
      this.prisma.serviceDeal.findMany({
        where: { dealId: { in: uniqueDealIds }, companyId },
        include: { service: { select: { amount: true } } },
      }),
    ]);

    const computedTotalsByDealId = new Map<string, { totalValue: number; totalQuantity: number }>(
      uniqueDealIds.map((id) => [id, { totalValue: 0, totalQuantity: 0 }]),
    );

    for (const serviceDeal of serviceDeals) {
      const totals = computedTotalsByDealId.get(serviceDeal.dealId);
      if (!totals) continue;
      totals.totalValue += serviceDeal.service.amount * serviceDeal.quantity;
      totals.totalQuantity += serviceDeal.quantity;
    }

    const existingDealsById = new Map(existingDeals.map((deal) => [deal.id, deal]));
    const updates: Promise<unknown>[] = [];

    for (const [dealId, totals] of computedTotalsByDealId.entries()) {
      const existing = existingDealsById.get(dealId);
      if (!existing) continue;
      if (existing.totalValue === totals.totalValue && existing.totalQuantity === totals.totalQuantity) continue;
      updates.push(this.prisma.deal.update({ where: { id: dealId, companyId }, data: totals }));
    }

    await Promise.all(updates);
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const services = await this.prisma.service.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("service"),
      },
      select: { id: true },
    });

    return new Set(services.map((service) => service.id));
  }
}
