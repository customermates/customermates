import type { ExtendedWidget } from "../widget.types";
import type { EntityForGrouping, DealRecord } from "./widget-calculator.types";
import type { Filter } from "@/core/base/base-get.schema";

import { EntityType } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getOrganizationRepo, getDealRepo, getServiceRepo, getTaskRepo } from "@/core/di";

const CUSTOM_FIELD_RELATION: Record<EntityType, keyof Prisma.CustomFieldValueWhereInput> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
};

export class WidgetDataFetcher extends BaseRepository {
  async getEntityCount(entityType: EntityType, filters: Filter[] | undefined): Promise<number> {
    switch (entityType) {
      case EntityType.contact:
        return await getContactRepo().getCount({ filters });
      case EntityType.organization:
        return await getOrganizationRepo().getCount({ filters });
      case EntityType.deal:
        return await getDealRepo().getCount({ filters });
      case EntityType.service:
        return await getServiceRepo().getCount({ filters });
      case EntityType.task:
        return await getTaskRepo().getCount({ filters });
    }
  }

  private async entityWhere(entityType: EntityType, filters: Filter[] | undefined): Promise<Record<string, unknown>> {
    switch (entityType) {
      case EntityType.contact:
        return (await getContactRepo().buildQueryArgs({ filters }, this.accessWhere("contact"))).where;
      case EntityType.organization:
        return (await getOrganizationRepo().buildQueryArgs({ filters }, this.accessWhere("organization"))).where;
      case EntityType.deal:
        return (await getDealRepo().buildQueryArgs({ filters }, this.accessWhere("deal"))).where;
      case EntityType.service:
        return (await getServiceRepo().buildQueryArgs({ filters }, this.accessWhere("service"))).where;
      case EntityType.task:
        return (await getTaskRepo().buildQueryArgs({ filters }, this.accessWhere("task"))).where;
    }
  }

  // Bounded deal where: deal access + dealFilters, AND-ed with an EXISTS-style relation filter on the
  // entity-filtered relation. No fetch-all-entities prefetch and no IN(all-ids).
  private async boundedDealWhere(widget: ExtendedWidget): Promise<Prisma.DealWhereInput> {
    const { companyId } = this;
    const dealWhere = (await getDealRepo().buildQueryArgs({ filters: widget.dealFilters }, this.accessWhere("deal")))
      .where as Prisma.DealWhereInput;
    const entityWhere = await this.entityWhere(widget.entityType, widget.entityFilters);

    switch (widget.entityType) {
      case EntityType.contact:
        return { companyId, AND: [dealWhere, { contacts: { some: { contact: entityWhere } } }] };
      case EntityType.organization:
        return { companyId, AND: [dealWhere, { organizations: { some: { organization: entityWhere } } }] };
      case EntityType.service:
        return { companyId, AND: [dealWhere, { services: { some: { service: entityWhere } } }] };
      case EntityType.deal:
        return { companyId, AND: [dealWhere, entityWhere as Prisma.DealWhereInput] };
      case EntityType.task:
        return { companyId, id: { in: [] } };
    }
  }

  async sumDealField(widget: ExtendedWidget, field: "totalValue" | "totalQuantity"): Promise<number> {
    const where = await this.boundedDealWhere(widget);
    const result = await this.prisma.deal.aggregate({ where, _sum: { totalValue: true, totalQuantity: true } });
    return (field === "totalValue" ? result._sum.totalValue : result._sum.totalQuantity) ?? 0;
  }

  async getDealsForEntityType(widget: ExtendedWidget): Promise<DealRecord[]> {
    const { entityType } = widget;
    if (entityType === EntityType.task) return [];

    const where = await this.boundedDealWhere(widget);
    const entityWhere = await this.entityWhere(entityType, widget.entityFilters);

    const select: Prisma.DealSelect = { id: true, name: true, totalValue: true, totalQuantity: true };

    if (entityType === EntityType.contact) {
      select.contacts = {
        where: { contact: entityWhere as Prisma.ContactWhereInput },
        select: { contact: { select: { id: true, firstName: true, lastName: true } } },
      };
    }

    if (entityType === EntityType.organization) {
      select.organizations = {
        where: { organization: entityWhere as Prisma.OrganizationWhereInput },
        select: { organization: { select: { id: true, name: true } } },
      };
    }

    if (entityType === EntityType.service) {
      select.services = {
        where: { service: entityWhere as Prisma.ServiceWhereInput },
        select: { quantity: true, service: { select: { id: true, name: true, amount: true } } },
      };
    }

    const res = (await this.prisma.deal.findMany({ where, select } as Prisma.DealFindManyArgs)) as Array<
      Record<string, unknown>
    >;

    return res.map((deal) => ({
      id: deal.id as string,
      name: deal.name as string,
      totalValue: deal.totalValue as number,
      totalQuantity: deal.totalQuantity as number,
      contacts: deal.contacts as DealRecord["contacts"],
      organizations: deal.organizations as DealRecord["organizations"],
      services: deal.services as DealRecord["services"],
    }));
  }

  // Bounded: aggregate CustomFieldValue rows grouped by value (one row per option), plus a single count
  // for entities that have no value for this column ("No Group"). No fetch-all-entities.
  async countByCustomColumn(
    entityType: EntityType,
    filters: Filter[] | undefined,
    columnId: string,
  ): Promise<Array<{ value: string | null; count: number }>> {
    const entityWhere = await this.entityWhere(entityType, filters);
    const relation = CUSTOM_FIELD_RELATION[entityType];

    const grouped = await this.prisma.customFieldValue.groupBy({
      by: ["value"],
      where: {
        companyId: this.companyId,
        columnId,
        entityType,
        [relation]: entityWhere,
      } as Prisma.CustomFieldValueWhereInput,
      _count: { _all: true },
    });

    const noValueCount = await this.countEntitiesWithoutColumn(entityType, entityWhere, columnId);

    const result = grouped.map((g) => ({ value: g.value, count: g._count._all }));
    if (noValueCount > 0) result.push({ value: null, count: noValueCount });

    return result;
  }

  private async countEntitiesWithoutColumn(
    entityType: EntityType,
    entityWhere: Record<string, unknown>,
    columnId: string,
  ): Promise<number> {
    const customFieldValues = { none: { columnId } };

    switch (entityType) {
      case EntityType.contact:
        return this.prisma.contact.count({
          where: { ...(entityWhere as Prisma.ContactWhereInput), customFieldValues },
        });
      case EntityType.organization:
        return this.prisma.organization.count({
          where: { ...(entityWhere as Prisma.OrganizationWhereInput), customFieldValues },
        });
      case EntityType.deal:
        return this.prisma.deal.count({ where: { ...(entityWhere as Prisma.DealWhereInput), customFieldValues } });
      case EntityType.service:
        return this.prisma.service.count({
          where: { ...(entityWhere as Prisma.ServiceWhereInput), customFieldValues },
        });
      case EntityType.task:
        return this.prisma.task.count({ where: { ...(entityWhere as Prisma.TaskWhereInput), customFieldValues } });
    }
  }

  async getEntitiesForGrouping(entityType: EntityType, filters: Filter[] | undefined): Promise<EntityForGrouping[]> {
    switch (entityType) {
      case EntityType.contact: {
        const contacts = await this.getContacts(filters);
        return contacts.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));
      }
      case EntityType.organization: {
        const organizations = await this.getOrganizations(filters);
        return organizations.map((o) => ({ id: o.id, name: o.name }));
      }
      case EntityType.deal: {
        const deals = await this.getDealsList(filters);
        return deals.map((d) => ({ id: d.id, name: d.name }));
      }
      case EntityType.service: {
        const services = await this.getServices(filters);
        return services.map((s) => ({ id: s.id, name: s.name }));
      }
      case EntityType.task: {
        const tasks = await this.getTasks(filters);
        return tasks.map((t) => ({ id: t.id, name: t.name }));
      }
    }
  }

  private async getContacts(filters: Filter[] | undefined) {
    const { where, orderBy } = await getContactRepo().buildQueryArgs({ filters }, this.accessWhere("contact"));
    return await this.prisma.contact.findMany({
      where,
      orderBy,
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private async getOrganizations(filters: Filter[] | undefined) {
    const { where, orderBy } = await getOrganizationRepo().buildQueryArgs(
      { filters },
      this.accessWhere("organization"),
    );
    return await this.prisma.organization.findMany({ where, orderBy, select: { id: true, name: true } });
  }

  private async getDealsList(filters: Filter[] | undefined) {
    const { where, orderBy } = await getDealRepo().buildQueryArgs({ filters }, this.accessWhere("deal"));
    return await this.prisma.deal.findMany({ where, orderBy, select: { id: true, name: true } });
  }

  private async getServices(filters: Filter[] | undefined) {
    const { where, orderBy } = await getServiceRepo().buildQueryArgs({ filters }, this.accessWhere("service"));
    return await this.prisma.service.findMany({ where, orderBy, select: { id: true, name: true } });
  }

  private async getTasks(filters: Filter[] | undefined) {
    const { where, orderBy } = await getTaskRepo().buildQueryArgs({ filters }, this.accessWhere("task"));
    return await this.prisma.task.findMany({ where, orderBy, select: { id: true, name: true } });
  }
}
