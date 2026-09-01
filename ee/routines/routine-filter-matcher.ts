import type { Filter } from "@/core/base/base-get.schema";
import type { Prisma } from "@/generated/prisma";

import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

export abstract class RoutineFilterQueryRepo {
  abstract buildQueryArgs(
    params: { filters?: Filter[] },
    baseWhere: Record<string, unknown>,
  ): Promise<{ where: unknown }>;
}

export abstract class RoutineFilterMatcher {
  abstract matches(entityType: EntityType, entityId: string, filters: Filter[]): Promise<boolean>;
}

export class PrismaRoutineFilterMatcher extends BaseRepository implements RoutineFilterMatcher {
  constructor(
    private contactRepo: RoutineFilterQueryRepo,
    private organizationRepo: RoutineFilterQueryRepo,
    private dealRepo: RoutineFilterQueryRepo,
    private serviceRepo: RoutineFilterQueryRepo,
    private taskRepo: RoutineFilterQueryRepo,
  ) {
    super();
  }

  async matches(entityType: EntityType, entityId: string, filters: Filter[]): Promise<boolean> {
    if (filters.length === 0) return true;

    const repo = this.repoFor(entityType);
    if (!repo) return true;

    const { where } = await repo.buildQueryArgs({ filters }, { id: entityId, companyId: this.companyId });

    return (await this.countFor(entityType, where)) > 0;
  }

  private repoFor(entityType: EntityType): RoutineFilterQueryRepo | null {
    if (entityType === EntityType.contact) return this.contactRepo;
    if (entityType === EntityType.organization) return this.organizationRepo;
    if (entityType === EntityType.deal) return this.dealRepo;
    if (entityType === EntityType.service) return this.serviceRepo;
    if (entityType === EntityType.task) return this.taskRepo;

    return null;
  }

  private countFor(entityType: EntityType, where: unknown): Promise<number> {
    if (entityType === EntityType.contact)
      return this.prisma.contact.count({ where: where as Prisma.ContactWhereInput });
    if (entityType === EntityType.organization)
      return this.prisma.organization.count({ where: where as Prisma.OrganizationWhereInput });
    if (entityType === EntityType.deal) return this.prisma.deal.count({ where: where as Prisma.DealWhereInput });
    if (entityType === EntityType.service)
      return this.prisma.service.count({ where: where as Prisma.ServiceWhereInput });

    return this.prisma.task.count({ where: where as Prisma.TaskWhereInput });
  }
}
