import { EntityType, Prisma } from "@/generated/prisma";

import { ExtendedWidget } from "../widget.types";

import { EntityForGrouping, DealRecord } from "./widget-calculator.types";

import { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { PrismaContactRepo } from "@/features/contacts/prisma-contact.repository";
import { PrismaOrganizationRepo } from "@/features/organizations/prisma-organization.repository";
import { PrismaDealRepo } from "@/features/deals/prisma-deal.repository";
import { PrismaServiceRepo } from "@/features/services/prisma-service.repository";
import { PrismaTaskRepo } from "@/features/tasks/prisma-task.repository";
import { di } from "@/core/dependency-injection/container";

@Repository
export class WidgetDataFetcher extends BaseRepository {
  private get contactRepo() {
    return di.get(PrismaContactRepo);
  }

  private get organizationRepo() {
    return di.get(PrismaOrganizationRepo);
  }

  private get dealRepo() {
    return di.get(PrismaDealRepo);
  }

  private get serviceRepo() {
    return di.get(PrismaServiceRepo);
  }

  private get taskRepo() {
    return di.get(PrismaTaskRepo);
  }

  async getEntityCount(entityType: EntityType, filters: Filter[] | undefined): Promise<number> {
    switch (entityType) {
      case EntityType.contact:
        return await this.contactRepo.getCount({ filters });
      case EntityType.organization:
        return await this.organizationRepo.getCount({ filters });
      case EntityType.deal:
        return await this.dealRepo.getCount({ filters });
      case EntityType.service:
        return await this.serviceRepo.getCount({ filters });
      case EntityType.task:
        return await this.taskRepo.getCount({ filters });
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
      const dealFilterArgs = await this.dealRepo.buildQueryArgs({ filters: dealFilters }, baseWhere);
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
    const args = await this.contactRepo.buildQueryArgs(params, this.accessWhere("contact"));
    return await this.prisma.contact.findMany({
      ...args,
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  async getOrganizations(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const args = await this.organizationRepo.buildQueryArgs(params, this.accessWhere("organization"));
    return await this.prisma.organization.findMany({
      ...args,
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getDealsList(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const args = await this.dealRepo.buildQueryArgs(params, this.accessWhere("deal"));
    return await this.prisma.deal.findMany({
      ...args,
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getServices(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const args = await this.serviceRepo.buildQueryArgs(params, this.accessWhere("service"));
    return await this.prisma.service.findMany({
      ...args,
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getTasks(filters: Filter[] | undefined) {
    const params: GetQueryParams = { filters };
    const args = await this.taskRepo.buildQueryArgs(params, this.accessWhere("task"));
    return await this.prisma.task.findMany({
      ...args,
      select: {
        id: true,
        name: true,
      },
    });
  }
}
