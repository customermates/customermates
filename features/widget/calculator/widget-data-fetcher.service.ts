import type { ExtendedWidget } from "../widget.types";
import type { EntityForGrouping, DealRecord } from "./widget-calculator.types";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";

import { EntityType } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getOrganizationRepo, getDealRepo, getServiceRepo, getTaskRepo } from "@/core/di";

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

  async getDealsForEntityType(widget: ExtendedWidget): Promise<DealRecord[]> {
    const { entityType, entityFilters, dealFilters } = widget;

    const baseWhere = this.accessWhere("deal");
    const where: Prisma.DealWhereInput = { ...baseWhere };

    if (dealFilters && dealFilters.length > 0) {
      const dealFilterArgs = await getDealRepo().buildQueryArgs({ filters: dealFilters }, baseWhere);
      Object.assign(where, dealFilterArgs.where);
    }

    const needsContacts = entityType === EntityType.contact;
    const needsOrganizations = entityType === EntityType.organization;
    const needsServices = entityType === EntityType.service;

    switch (entityType) {
      case EntityType.contact: {
        const contacts = await this.getContacts(entityFilters);
        const entityIds = contacts.map((c) => c.id);
        where.contacts = {
          some: {
            contactId: { in: entityIds },
            contact: this.accessWhere("contact"),
          },
        };
        break;
      }

      case EntityType.organization: {
        const organizations = await this.getOrganizations(entityFilters);
        const entityIds = organizations.map((o) => o.id);
        where.organizations = {
          some: {
            organizationId: { in: entityIds },
            organization: this.accessWhere("organization"),
          },
        };
        break;
      }

      case EntityType.deal: {
        const deals = await this.getDealsList(entityFilters);
        const entityIds = deals.map((d) => d.id);
        where.id = { in: entityIds };
        break;
      }

      case EntityType.service: {
        const services = await this.getServices(entityFilters);
        const entityIds = services.map((s) => s.id);
        where.services = {
          some: {
            serviceId: { in: entityIds },
            service: this.accessWhere("service"),
          },
        };
        break;
      }

      case EntityType.task: {
        return [];
      }
    }

    const select: Prisma.DealSelect = {
      id: true,
      name: true,
      totalValue: true,
      totalQuantity: true,
    };

    if (needsContacts) {
      select.contacts = {
        where: { contact: this.accessWhere("contact") },
        select: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      };
    }

    if (needsOrganizations) {
      select.organizations = {
        where: { organization: this.accessWhere("organization") },
        select: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      };
    }

    if (needsServices) {
      select.services = {
        where: { service: this.accessWhere("service") },
        select: {
          quantity: true,
          service: {
            select: {
              id: true,
              name: true,
              amount: true,
            },
          },
        },
      };
    }

    const res = await this.prisma.deal.findMany({
      where,
      select,
    });

    return res.map((deal) => {
      const record: DealRecord = {
        id: deal.id,
        name: deal.name,
        totalValue: deal.totalValue,
        totalQuantity: deal.totalQuantity,
      };

      if (needsContacts && "contacts" in deal) record.contacts = deal.contacts as unknown as DealRecord["contacts"];

      if (needsOrganizations && "organizations" in deal)
        record.organizations = deal.organizations as unknown as DealRecord["organizations"];

      if (needsServices && "services" in deal) record.services = deal.services as unknown as DealRecord["services"];

      return record;
    });
  }

  async getContacts(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const { where, orderBy } = await getContactRepo().buildQueryArgs(params, this.accessWhere("contact"));
    return await this.prisma.contact.findMany({
      where,
      orderBy,
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  async getOrganizations(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const { where, orderBy } = await getOrganizationRepo().buildQueryArgs(params, this.accessWhere("organization"));
    return await this.prisma.organization.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getDealsList(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const { where, orderBy } = await getDealRepo().buildQueryArgs(params, this.accessWhere("deal"));
    return await this.prisma.deal.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getServices(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const { where, orderBy } = await getServiceRepo().buildQueryArgs(params, this.accessWhere("service"));
    return await this.prisma.service.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getTasks(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const { where, orderBy } = await getTaskRepo().buildQueryArgs(params, this.accessWhere("task"));
    return await this.prisma.task.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
      },
    });
  }
}
