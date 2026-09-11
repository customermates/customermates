import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Prisma } from "@/generated/prisma";

import { EntityType } from "@/generated/prisma";

import { BaseQueryBuilder } from "@/core/base/base-query-builder";
import { BaseRepository } from "@/core/base/base-repository";

export abstract class RoutineFilterQueryRepo {
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[];
  abstract buildQueryArgs(
    params: { filters?: Filter[] },
    baseWhere: Record<string, unknown>,
  ): Promise<{ where: unknown }>;
}

export abstract class RoutineFilterMatcher {
  abstract matches(entityType: EntityType, entityId: string, filters: Filter[]): Promise<boolean>;
  abstract matchesUnscoped(
    entityType: EntityType,
    entityId: string,
    filters: Filter[],
    scope: {
      companyId: string;
      readOwnUserId: string | null;
      filterableFields: FilterableField[];
      customColumns: CustomColumnDto[];
    },
  ): Promise<boolean>;
}

class ExplicitRoutineFilterQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  constructor(
    private readonly fields: FilterableField[],
    private readonly columns: CustomColumnDto[],
  ) {
    super();
  }

  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(this.fields);
  }

  override getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve(this.columns);
  }
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
    const repo = this.repoFor(entityType);
    if (!repo) return false;

    const filterableFields = await repo.getFilterableFields();
    const validFilters = repo.validateFilters({ filters, filterableFields });
    if (validFilters.length !== filters.length) return false;

    const { where } = await repo.buildQueryArgs(
      { filters: validFilters },
      { ...this.accessWhere(entityType), id: entityId },
    );

    return (await this.countFor(entityType, where)) > 0;
  }

  async matchesUnscoped(
    entityType: EntityType,
    entityId: string,
    filters: Filter[],
    scope: {
      companyId: string;
      readOwnUserId: string | null;
      filterableFields: FilterableField[];
      customColumns: CustomColumnDto[];
    },
  ): Promise<boolean> {
    const builder = new ExplicitRoutineFilterQueryBuilder(scope.filterableFields, scope.customColumns);
    const validFilters = builder.validateFilters({ filters, filterableFields: scope.filterableFields });
    if (validFilters.length !== filters.length) return false;

    const baseWhere = {
      companyId: scope.companyId,
      ...(scope.readOwnUserId ? { users: { some: { userId: scope.readOwnUserId } } } : {}),
      id: entityId,
    };
    const { where } = await builder.buildQueryArgs({ filters: validFilters }, baseWhere);

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
