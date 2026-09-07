import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RepoArgs } from "@/core/utils/types";
import type { GetDealWeightingColumnRepo } from "@/features/company/get-deal-weighting-column.repo";
import type { GetWidgetFilterableFieldsDealRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { GetCompanyWideDealRepo } from "./get-company-wide-deal.repo";
import type { CreateDealRepo } from "./upsert/create-deal.repo";
import type { UpdateDealRepo } from "./upsert/update-deal.repo";
import type { GetDealsRepo } from "./get/get-deals.interactor";
import type { GetConfigurationRepo } from "@/core/base/base-get-configuration.interactor";
import type { GetDealByIdRepo } from "./get/get-deal-by-id.interactor";
import type { DeleteDealRepo } from "./delete/delete-deal.repo";
import type { FindDealsByIdsRepo } from "./find-deals-by-ids.repo";
import type { ModifyRelationDealRepo } from "@/features/relations/modify-entity-relation.interactor";

import { EntityType, Resource } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";
import type { ExportPageParams, ExportRecordsRepo } from "@/core/base/base-export-records-page.interactor";

import { type DealDto } from "./deal.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import {
  customSelectGroupables,
  dateGroupables,
  enumGroupables,
  relationGroupables,
} from "@/core/base/grouping/groupable-field";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { getCustomColumnRepo } from "@/core/di";
import { computeWeightedValue, readOptionWeights } from "./deal-weighting";

export class PrismaDealRepo
  extends BaseRepository
  implements
    CreateDealRepo,
    UpdateDealRepo,
    GetDealsRepo,
    GetConfigurationRepo,
    GetDealByIdRepo,
    DeleteDealRepo,
    GetWidgetFilterableFieldsDealRepo,
    FindDealsByIdsRepo,
    GetCompanyWideDealRepo,
    ModifyRelationDealRepo,
    ExportRecordsRepo<DealDto>
{
  constructor(private readonly companyRepo: GetDealWeightingColumnRepo) {
    super();
  }

  private get userScopedSelect() {
    return {
      id: true,
      name: true,
      totalValue: true,
      totalQuantity: true,
      weightedValue: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      organizations: {
        where: { organization: this.accessWhere("organization") },
        select: { organization: { select: { id: true, name: true } } },
      },
      users: {
        where: { user: { is: this.accessWhere("user") } },
        select: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
      },
      contacts: {
        where: { contact: this.accessWhere("contact") },
        select: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      },
      services: {
        where: { service: this.accessWhere("service") },
        select: {
          service: { select: { id: true, name: true, amount: true } },
          serviceId: true,
          quantity: true,
        },
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
      contacts: { select: this.userScopedSelect.contacts.select },
      services: { select: this.userScopedSelect.services.select },
      tasks: { select: this.userScopedSelect.tasks.select },
    };
  }

  getSearchableFields() {
    return [{ field: "name" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"] },
      { field: "totalValue", resolvedFields: ["totalValue"] },
      { field: "totalQuantity", resolvedFields: ["totalQuantity"] },
      { field: "weightedValue", resolvedFields: ["weightedValue"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.deals)) return [];

    const customFields = await getCustomColumnRepo().getFilterableCustomFields(EntityType.deal);

    const filterFields = [];

    if (this.canAccess(Resource.contacts)) {
      filterFields.push({
        field: FilterFieldKey.contactIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.contactIds],
      });
    }

    if (this.canAccess(Resource.organizations)) {
      filterFields.push({
        field: FilterFieldKey.organizationIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.organizationIds],
      });
    }

    if (this.canAccess(Resource.services)) {
      filterFields.push({
        field: FilterFieldKey.serviceIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.serviceIds],
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
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ];
  }

  async getGroupableFields(customColumns?: readonly CustomColumnDto[]) {
    if (!this.canAccess(Resource.deals)) return [];

    return [
      ...customSelectGroupables(EntityType.deal, customColumns ?? (await this.getCustomColumns())),
      ...relationGroupables("deal", {
        contactIds: this.canAccess(Resource.contacts),
        organizationIds: this.canAccess(Resource.organizations),
        serviceIds: this.canAccess(Resource.services),
        taskIds: this.canAccess(Resource.tasks),
        userIds: this.canAccess(Resource.users),
      }),
      ...enumGroupables("deal", {}),
      ...dateGroupables("deal", { createdAt: true, updatedAt: true }),
    ];
  }

  async getDealById(id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: {
        id,
        ...this.accessWhere("deal"),
      },
      select: this.userScopedSelect,
    });

    if (!deal) return null;

    return this.toDto(deal);
  }

  async getOrThrowCompanyWide(id: string) {
    const { companyId } = this.user;

    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id, companyId },
      select: this.companyScopedSelect,
    });

    return this.toDto(deal);
  }

  async getManyOrThrowCompanyWide(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const deals = await this.prisma.deal.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (deals.length !== uniqueIds.length) throw new Error("One or more deals not found");

    return deals.map((deal) => this.toDto(deal));
  }

  private toDto(deal: Prisma.DealGetPayload<{ select: PrismaDealRepo["userScopedSelect"] }>): DealDto {
    return {
      ...deal,
      organizations: deal.organizations.map((it) => it.organization),
      users: deal.users.map((it) => it.user),
      contacts: deal.contacts.map((it) => it.contact),
      services: deal.services.map((it) => ({ ...it.service, quantity: it.quantity })),
      tasks: deal.tasks.map((it) => it.task),
    };
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "deal",
      baseWhere: this.accessWhere("deal"),
      select: this.userScopedSelect,
      params,
      map: (deal: Prisma.DealGetPayload<{ select: PrismaDealRepo["userScopedSelect"] }>) => this.toDto(deal),
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("deal"));

    return this.prisma.deal.count({ where });
  }

  private exportWhere(selectedIds?: string[]): Prisma.DealWhereInput {
    const scoped = this.accessWhere("deal");

    return selectedIds && selectedIds.length > 0 ? { ...scoped, id: { in: selectedIds } } : scoped;
  }

  async exportItems(params: ExportPageParams) {
    return this.list({
      model: "deal",
      baseWhere: this.exportWhere(params.selectedIds),
      select: this.userScopedSelect,
      params,
      map: (deal: Prisma.DealGetPayload<{ select: PrismaDealRepo["userScopedSelect"] }>) => this.toDto(deal),
    });
  }

  async exportCount(params: ExportPageParams) {
    const { where } = await this.buildQueryArgs(params, this.exportWhere(params.selectedIds));

    return this.prisma.deal.count({ where });
  }

  @Transaction
  async createDealOrThrow(args: RepoArgs<CreateDealRepo, "createDealOrThrow">) {
    const { companyId } = this.user;
    const { organizationIds, userIds, contactIds, services, taskIds, customFieldValues, name, notes } = args;

    const data = {
      name,
      notes: notes,
      companyId,
    };

    const deal = await this.prisma.deal.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (organizationIds.length > 0) {
      promises.push(
        this.prisma.dealOrganization.createMany({
          data: organizationIds.map((organizationId) => ({
            dealId: deal.id,
            organizationId,
            companyId,
          })),
        }),
      );
    }

    if (userIds.length > 0) {
      promises.push(
        this.prisma.dealUser.createMany({
          data: userIds.map((userId) => ({
            dealId: deal.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (contactIds.length > 0) {
      promises.push(
        this.prisma.dealContact.createMany({
          data: contactIds.map((contactId) => ({
            dealId: deal.id,
            contactId,
            companyId,
          })),
        }),
      );
    }

    if (services.length > 0) {
      promises.push(
        this.prisma.serviceDeal.createMany({
          data: services.map((service) => ({
            dealId: deal.id,
            serviceId: service.serviceId,
            quantity: service.quantity,
            companyId,
          })),
        }),
      );
    }

    if (taskIds.length > 0) {
      promises.push(
        this.prisma.taskDeal.createMany({
          data: taskIds.map((taskId) => ({
            dealId: deal.id,
            taskId,
            companyId,
          })),
        }),
      );
    }

    promises.push(getCustomColumnRepo().writeValuesForCreate(EntityType.deal, deal.id, customFieldValues));

    await Promise.all(promises);

    await this.recalculateTotals([deal.id]);

    const createdDeal = await this.prisma.deal.findFirstOrThrow({
      where: { id: deal.id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    const res = this.toDto(createdDeal);

    return res;
  }

  @Transaction
  async updateDealOrThrow(args: RepoArgs<UpdateDealRepo, "updateDealOrThrow">) {
    const { companyId } = this.user;
    const { id, organizationIds, userIds, contactIds, services, taskIds, customFieldValues, ...dealData } = args;

    const data: Prisma.DealUpdateManyArgs["data"] = { companyId };

    if (dealData.name !== undefined) data.name = dealData.name;
    if (dealData.notes !== undefined) data.notes = dealData.notes;

    await this.prisma.deal.updateMany({
      where: { id, ...this.accessWhere("deal") },
      data,
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (organizationIds !== undefined) {
      deletePromises.push(
        this.prisma.dealOrganization.deleteMany({
          where: { dealId: id, companyId, organization: this.accessWhere("organization") },
        }),
      );

      if (organizationIds !== null && organizationIds.length > 0) {
        createPromises.push(
          this.prisma.dealOrganization.createMany({
            data: organizationIds.map((organizationId) => ({
              dealId: id,
              organizationId,
              companyId,
            })),
          }),
        );
      }
    }

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.dealUser.deleteMany({
          where: { dealId: id, companyId, user: { is: this.accessWhere("user") } },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.dealUser.createMany({
            data: userIds.map((userId) => ({
              dealId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (contactIds !== undefined) {
      deletePromises.push(
        this.prisma.dealContact.deleteMany({
          where: { dealId: id, companyId, contact: this.accessWhere("contact") },
        }),
      );

      if (contactIds !== null && contactIds.length > 0) {
        createPromises.push(
          this.prisma.dealContact.createMany({
            data: contactIds.map((contactId) => ({
              dealId: id,
              contactId,
              companyId,
            })),
          }),
        );
      }
    }

    if (services !== undefined) {
      deletePromises.push(
        this.prisma.serviceDeal.deleteMany({
          where: { dealId: id, companyId, service: this.accessWhere("service") },
        }),
      );

      if (services !== null && services.length > 0) {
        createPromises.push(
          this.prisma.serviceDeal.createMany({
            data: services.map((service) => ({
              dealId: id,
              serviceId: service.serviceId,
              quantity: service.quantity,
              companyId,
            })),
          }),
        );
      }
    }

    if (taskIds !== undefined) {
      deletePromises.push(
        this.prisma.taskDeal.deleteMany({
          where: { dealId: id, companyId, task: this.accessWhere("task") },
        }),
      );

      if (taskIds !== null && taskIds.length > 0) {
        createPromises.push(
          this.prisma.taskDeal.createMany({
            data: taskIds.map((taskId) => ({
              dealId: id,
              taskId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(getCustomColumnRepo().deleteValuesForEntity(EntityType.deal, id));
      else createPromises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.deal, id, customFieldValues));
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    await this.recalculateTotals([id]);

    const updatedDeal = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    const res = this.toDto(updatedDeal);

    return res;
  }

  async getCustomColumns() {
    return getCustomColumnRepo().findByEntityType(EntityType.deal);
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const deals = await this.prisma.deal.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("deal"),
      },
      select: { id: true },
    });

    return new Set(deals.map((deal) => deal.id));
  }

  @Transaction
  async deleteDealOrThrow(id: string) {
    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    const dealDto: DealDto = this.toDto(deal);

    await this.prisma.deal.deleteMany({ where: { id, ...this.accessWhere("deal") } });

    return dealDto;
  }

  async recalculateTotals(dealIds: string[]) {
    if (dealIds.length === 0) return;

    const { companyId } = this.user;
    const uniqueDealIds = Array.from(new Set(dealIds));

    const [existingDeals, serviceDeals, weighting] = await Promise.all([
      this.prisma.deal.findMany({
        where: { id: { in: uniqueDealIds }, companyId },
        select: { id: true, totalValue: true, totalQuantity: true, weightedValue: true },
      }),
      this.prisma.serviceDeal.findMany({
        where: { dealId: { in: uniqueDealIds }, companyId },
        include: { service: { select: { amount: true } } },
      }),
      this.resolveDealWeighting(companyId),
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

    const stageValueByDealId = weighting
      ? await this.findStageValuesByDealId(weighting.columnId, uniqueDealIds, companyId)
      : new Map<string, string>();

    const existingDealsById = new Map(existingDeals.map((deal) => [deal.id, deal]));
    const updates: Promise<unknown>[] = [];

    for (const [dealId, totals] of computedTotalsByDealId.entries()) {
      const existing = existingDealsById.get(dealId);
      if (!existing) continue;

      const stageValue = stageValueByDealId.get(dealId);
      const weightedValue = weighting
        ? computeWeightedValue(
            totals.totalValue,
            stageValue ? weighting.weightByOptionValue.get(stageValue) : undefined,
          )
        : null;

      if (
        existing.totalValue === totals.totalValue &&
        existing.totalQuantity === totals.totalQuantity &&
        existing.weightedValue === weightedValue
      )
        continue;

      updates.push(this.prisma.deal.update({ where: { id: dealId, companyId }, data: { ...totals, weightedValue } }));
    }

    await Promise.all(updates);
  }

  async recalculateWeightedValuesForCompany() {
    const { companyId } = this.user;

    const deals = await this.prisma.deal.findMany({ where: { companyId }, select: { id: true } });

    await this.recalculateTotals(deals.map((deal) => deal.id));
  }

  private async resolveDealWeighting(companyId: string) {
    const columnId = await this.companyRepo.getDealWeightingColumnId();
    if (!columnId) return null;

    const column = await this.prisma.customColumn.findFirst({
      where: { id: columnId, companyId, entityType: EntityType.deal },
      select: { id: true, options: true },
    });

    if (!column) return null;

    return { columnId: column.id, weightByOptionValue: readOptionWeights(column.options) };
  }

  private async findStageValuesByDealId(columnId: string, dealIds: string[], companyId: string) {
    const rows = await this.prisma.customFieldValue.findMany({
      where: { columnId, companyId, dealId: { in: dealIds } },
      select: { dealId: true, value: true },
    });

    return new Map(rows.flatMap((row) => (row.dealId && row.value ? [[row.dealId, row.value] as const] : [])));
  }
}
