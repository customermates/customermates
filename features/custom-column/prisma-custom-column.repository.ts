import type { RepoArgs } from "@/core/utils/types";

import { CustomColumnType, Prisma, EntityType } from "@/generated/prisma";

import { UpsertCustomColumnRepo } from "./upsert-custom-column.interactor";
import { GetCustomColumnsRepo } from "./get-custom-columns.interactor";
import { GetCustomColumnsByEntityTypeRepo } from "./get-custom-columns-by-entity-type.interactor";
import { FindCustomColumnRepo } from "./find-custom-column.repo";
import { type CustomColumnDto } from "./custom-column.schema";

import { DeleteCustomColumnRepo } from "@/features/custom-column/delete-custom-column.interactor";
import { ContactCustomColumnRepo } from "@/features/contacts/get/get-contact-by-id.interactor";
import { OrganizationCustomColumnRepo } from "@/features/organizations/get/get-organization-by-id.interactor";
import { DealCustomColumnRepo } from "@/features/deals/get/get-deal-by-id.interactor";
import { ServiceCustomColumnRepo } from "@/features/services/get/get-service-by-id.interactor";
import { TaskCustomColumnRepo } from "@/features/tasks/get/get-task-by-id.interactor";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Repository } from "@/core/decorators/repository.decorator";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

@Repository
export class PrismaCustomColumnRepo
  extends BaseRepository
  implements
    DeleteCustomColumnRepo,
    UpsertCustomColumnRepo,
    GetCustomColumnsRepo,
    GetCustomColumnsByEntityTypeRepo,
    FindCustomColumnRepo,
    ContactCustomColumnRepo,
    OrganizationCustomColumnRepo,
    DealCustomColumnRepo,
    ServiceCustomColumnRepo,
    TaskCustomColumnRepo
{
  private get baseSelect() {
    return {
      id: true,
      label: true,
      type: true,
      entityType: true,
      options: true,
    } as const;
  }

  readonly entityIdFieldByType: Record<EntityType, string> = {
    [EntityType.contact]: "contactId",
    [EntityType.organization]: "organizationId",
    [EntityType.deal]: "dealId",
    [EntityType.service]: "serviceId",
    [EntityType.task]: "taskId",
  };

  readonly operatorsByType: Record<CustomColumnType, FilterOperatorKey[]> = {
    [CustomColumnType.singleSelect]: [
      FilterOperatorKey.in,
      FilterOperatorKey.notIn,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ],
    [CustomColumnType.currency]: [
      FilterOperatorKey.equals,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ],
    [CustomColumnType.date]: [
      FilterOperatorKey.equals,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ],
    [CustomColumnType.dateTime]: [
      FilterOperatorKey.equals,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ],
    [CustomColumnType.email]: [FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
    [CustomColumnType.phone]: [FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
    [CustomColumnType.plain]: [FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
    [CustomColumnType.link]: [FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
  };

  async find(id: string) {
    const { companyId } = this.user;

    const column = await this.prisma.customColumn.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return column as CustomColumnDto;
  }

  async getCustomColumns() {
    const { companyId } = this.user;

    const columns = await this.prisma.customColumn.findMany({
      where: { companyId },
      select: this.baseSelect,
      orderBy: [{ entityType: "asc" }, { label: "asc" }],
    });

    return columns as CustomColumnDto[];
  }

  async findByEntityType(entityType: EntityType) {
    const { companyId } = this.user;

    const columns = await this.prisma.customColumn.findMany({
      where: { companyId, entityType },
      select: this.baseSelect,
      orderBy: [{ label: "asc" }],
    });

    return columns as CustomColumnDto[];
  }

  @Transaction
  async delete(id: string) {
    const { companyId } = this.user;

    await Promise.all([
      this.prisma.widget.deleteMany({
        where: { groupByCustomColumnId: id, companyId },
      }),
      this.prisma.p13n.deleteMany({
        where: { groupingColumnId: id, companyId },
      }),
      this.prisma.customColumn.deleteMany({
        where: { id, companyId },
      }),
    ]);

    return { id };
  }

  @Transaction
  async upsertCustomColumn(args: RepoArgs<UpsertCustomColumnRepo, "upsertCustomColumn">) {
    const { companyId } = this.user;

    const columnData: {
      label: string;
      type: CustomColumnType;
      entityType: EntityType;
      companyId: string;
      options?: Prisma.InputJsonValue;
    } = {
      label: args.label,
      type: args.type,
      entityType: args.entityType,
      companyId,
    };

    if ("options" in args && args.options !== undefined) columnData.options = args.options;

    const column = await this.prisma.customColumn.upsert({
      where: { id: args.id ?? "" },
      create: columnData,
      update: columnData,
      select: this.baseSelect,
    });

    if (args.type === CustomColumnType.singleSelect && args.options) {
      const validOptionValues = new Set(args.options.options?.map((opt) => opt.value) ?? []);
      const defaultOption = args.options.options?.find((option) => option.isDefault);

      if (args.id)
        await this.cleanupInvalidOptionValues(column.id, args.entityType, validOptionValues, defaultOption?.value);

      if (defaultOption) await this.createDefaultCustomFieldValues(column.id, args.entityType, defaultOption.value);
    }

    return column as CustomColumnDto;
  }

  async findCustomFieldValuesMap(columnId: string, entityType: EntityType, entityIds: string[]) {
    const { companyId } = this.user;

    if (entityIds.length === 0) return new Map();

    const idField = this.entityIdFieldByType[entityType];

    const values = await this.prisma.customFieldValue.findMany({
      where: { companyId, columnId, entityType, [idField]: { in: entityIds } },
      select: { [idField]: true, value: true },
    });

    return new Map(values.map((v) => [v[idField] as string, v.value ?? undefined]));
  }

  async replaceValuesForEntity(
    entityType: EntityType,
    entityId: string,
    values: Array<{ columnId: string; value?: string | undefined | null }>,
  ) {
    const { companyId } = this.user;
    const idField = this.entityIdFieldByType[entityType];
    const relationWhere = { [idField]: entityId };

    if (values.length === 0) return;

    const columnIds = values.map((v) => v.columnId);

    await this.prisma.customFieldValue.deleteMany({
      where: {
        companyId,
        ...relationWhere,
        columnId: { in: columnIds },
      },
    });

    const nonEmptyValues = values.filter((v) => v.value !== undefined && v.value !== null && v.value !== "");

    if (nonEmptyValues.length > 0) {
      const columns = await this.prisma.customColumn.findMany({
        where: { id: { in: nonEmptyValues.map((v) => v.columnId) }, companyId },
        select: { id: true, type: true },
      });

      const typeByColumnId = new Map(columns.map((c) => [c.id, c.type]));

      const data = nonEmptyValues.reduce<Array<Prisma.CustomFieldValueCreateManyInput>>((acc, v) => {
        const { columnId, value } = v;
        const type = typeByColumnId.get(columnId);

        if (!type) return acc;

        acc.push({
          entityType,
          columnId,
          value,
          type,
          companyId,
          ...relationWhere,
        });

        return acc;
      }, []);

      if (data.length > 0) await this.prisma.customFieldValue.createMany({ data });
    }
  }

  async deleteValuesForEntity(entityType: EntityType, entityId: string) {
    const { companyId } = this.user;
    const idField = this.entityIdFieldByType[entityType];
    const relationWhere = { [idField]: entityId };

    await this.prisma.customFieldValue.deleteMany({ where: { companyId, ...relationWhere } });
  }

  async getFilterableCustomFields(entityType: EntityType) {
    const columns = await this.findByEntityType(entityType);

    return columns
      .filter((column) => column.type !== CustomColumnType.currency)
      .flatMap((column) => {
        return [
          {
            field: column.id,
            operators: this.operatorsByType[column.type],
            label: column.label,
          },
        ];
      });
  }

  private async createDefaultCustomFieldValues(columnId: string, entityType: EntityType, defaultValue: string) {
    const { companyId } = this.user;

    const entityConfig = {
      [EntityType.contact]: () => this.prisma.contact.findMany({ where: { companyId }, select: { id: true } }),
      [EntityType.organization]: () =>
        this.prisma.organization.findMany({ where: { companyId }, select: { id: true } }),
      [EntityType.deal]: () => this.prisma.deal.findMany({ where: { companyId }, select: { id: true } }),
      [EntityType.service]: () => this.prisma.service.findMany({ where: { companyId }, select: { id: true } }),
      [EntityType.task]: () => this.prisma.task.findMany({ where: { companyId }, select: { id: true } }),
    } satisfies Record<EntityType, () => Promise<{ id: string }[]>>;

    const entities = await entityConfig[entityType]();
    const entityIds = entities.map((e) => e.id);
    if (entityIds.length === 0) return;

    const valueByEntityId = await this.findCustomFieldValuesMap(columnId, entityType, entityIds);
    const entitiesNeedingDefault = entityIds.filter((id) => !valueByEntityId.has(id));
    if (entitiesNeedingDefault.length === 0) return;

    const idField = this.entityIdFieldByType[entityType];

    const createData = entitiesNeedingDefault.map((entityId) => ({
      companyId,
      columnId,
      entityType,
      value: defaultValue,
      type: CustomColumnType.singleSelect,
      [idField]: entityId,
    }));

    await this.prisma.customFieldValue.createMany({ data: createData });
  }

  private async cleanupInvalidOptionValues(
    columnId: string,
    entityType: EntityType,
    validOptionValues: Set<string>,
    defaultValue?: string,
  ) {
    const { companyId } = this.user;
    const idField = this.entityIdFieldByType[entityType];

    const invalidValues = await this.prisma.customFieldValue.findMany({
      where: {
        companyId,
        columnId,
        entityType,
        value: { notIn: Array.from(validOptionValues) },
      },
      select: { [idField]: true, id: true },
    });

    if (invalidValues.length === 0) return;

    const entityIds = invalidValues.map((v) => v[idField] as string);

    if (defaultValue && validOptionValues.has(defaultValue)) {
      await this.prisma.customFieldValue.updateMany({
        where: {
          companyId,
          columnId,
          entityType,
          [idField]: { in: entityIds },
        },
        data: { value: defaultValue },
      });
    } else {
      await this.prisma.customFieldValue.deleteMany({
        where: {
          companyId,
          columnId,
          entityType,
          [idField]: { in: entityIds },
        },
      });
    }
  }
}
