import type {
  Filter,
  FilterableField,
  GetQueryParams,
  PaginationRequest,
  SortDescriptor,
} from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { z } from "zod";
import { CustomColumnType } from "@/generated/prisma";

import { FilterFieldKey } from "@/core/types/filter-field-key";

export interface SortableField {
  field: string;
  resolvedFields: string[];
}

export interface SearchableField {
  field: string;
}

export enum ViewMode {
  table = "table",
  card = "card",
}

export enum FilterOperatorKey {
  equals = "equals",
  contains = "contains",
  in = "in",
  notIn = "notIn",
  gt = "gt",
  gte = "gte",
  lt = "lt",
  lte = "lte",
  between = "between",
  isNull = "isNull",
  isNotNull = "isNotNull",
  hasNone = "hasNone",
  hasSome = "hasSome",
}

type LogicalGroup<T> = { OR: T[] } | { AND: Array<{ OR: T[] }> };

type WithLogicalOperators<T> = T & {
  AND?: Array<T | LogicalGroup<T>>;
  OR?: T[];
};

type WithDynamicFields<T> = T & {
  [K: string]: unknown;
};

export type OrderByInput = Record<string, unknown>[];

function isCustomField(field: string): boolean {
  return z.uuid().safeParse(field).success;
}

const RELATION_FIELD_MAPPING: Record<FilterFieldKey, string> = {
  [FilterFieldKey.userIds]: "users.userId",
  [FilterFieldKey.serviceIds]: "services.serviceId",
  [FilterFieldKey.dealIds]: "deals.dealId",
  [FilterFieldKey.organizationIds]: "organizations.organizationId",
  [FilterFieldKey.contactIds]: "contacts.contactId",
  [FilterFieldKey.taskIds]: "tasks.taskId",
  [FilterFieldKey.emails]: "emails",
  [FilterFieldKey.updatedAt]: "updatedAt",
  [FilterFieldKey.createdAt]: "createdAt",
  [FilterFieldKey.event]: "event",
  [FilterFieldKey.status]: "status",
};

function getRelationFieldPath(field: string): string {
  const enumValue = Object.values(FilterFieldKey).find((key) => key.toString() === field);
  return enumValue ? (RELATION_FIELD_MAPPING[enumValue] ?? field) : field;
}

export abstract class BaseQueryBuilder<TWhereInput extends Record<string, unknown>> {
  getSearchableFields(): Array<SearchableField> {
    return [];
  }

  getSortableFields(): Array<SortableField> {
    return [];
  }

  getFilterableFields(): Promise<Array<FilterableField>> {
    return Promise.resolve([]);
  }

  getCustomColumns(): Promise<Array<CustomColumnDto>> {
    return Promise.resolve([]);
  }

  getArrayFields(): Set<string> {
    return new Set();
  }

  async buildQueryArgs(params: GetQueryParams, baseWhere: TWhereInput = {} as TWhereInput) {
    const where = await this.buildWhereClause(params.filters, params.searchTerm, baseWhere);
    const customColumns = await this.getCustomColumns();
    const customSort = resolveCustomSort(params.sortDescriptor, customColumns);
    const orderBy = customSort ? [] : this.buildOrderBy({ sortDescriptor: params.sortDescriptor });
    const pagination = this.buildPagination(params.pagination);

    return { where, orderBy, customSort, ...pagination };
  }

  validateFilters(filters: Filter[] | undefined, filterableFields: FilterableField[]): Filter[] {
    if (!Array.isArray(filters)) return [];

    const result: Filter[] = [];

    for (const filter of filters) {
      const hasValidStructure =
        filter &&
        typeof filter === "object" &&
        filter.field &&
        typeof filter.field === "string" &&
        filter.operator &&
        typeof filter.operator === "string";

      if (!hasValidStructure) continue;

      const fieldConfig = filterableFields.find((f) => f.field === filter.field);
      if (!fieldConfig || !fieldConfig.operators.includes(filter.operator)) continue;

      if (!isFilterValueWellFormed(filter, fieldConfig.operators)) continue;

      result.push(filter);
    }

    return result;
  }

  validateSortDescriptor(
    sortDescriptor: SortDescriptor | undefined,
    sortableFields: SortableField[],
    customColumns: CustomColumnDto[] = [],
  ): SortDescriptor | undefined {
    if (!sortDescriptor) return undefined;
    if (!sortDescriptor || typeof sortDescriptor !== "object") return undefined;
    if (!sortDescriptor.field || typeof sortDescriptor.field !== "string") return undefined;
    if (!sortDescriptor.direction || typeof sortDescriptor.direction !== "string") return undefined;

    const validDirections = ["asc", "desc"];
    const isValidDirection = validDirections.includes(sortDescriptor.direction);
    if (!isValidDirection) return undefined;

    if (customColumns.some((c) => c.id === sortDescriptor.field)) return sortDescriptor;

    const matched = sortableFields.find((s) => s.field === sortDescriptor.field);
    return matched ? sortDescriptor : undefined;
  }

  private buildPagination(pagination?: PaginationRequest | null) {
    if (!pagination) return { skip: 0, take: 100 };

    const pageSize = pagination.pageSize ?? 100;
    const page = pagination.page ?? 1;

    return {
      skip: (page - 1) * pageSize,
      take: pageSize,
    };
  }

  private async buildWhereClause(
    filters: Filter[] | undefined,
    searchTerm?: string | null,
    baseWhere: TWhereInput = {} as TWhereInput,
  ): Promise<TWhereInput> {
    const where = { ...baseWhere } as WithDynamicFields<TWhereInput> & WithLogicalOperators<TWhereInput>;
    const filterableFields = await this.getFilterableFields();
    const validFilters = this.validateFilters(filters, filterableFields);

    const customColumns = validFilters.some((f) => isCustomField(f.field)) ? await this.getCustomColumns() : [];
    const customColumnTypeById = new Map(customColumns.map((c) => [c.id, c.type]));

    for (const filter of validFilters) this.applyFieldFilter(where, filter, filterableFields, customColumnTypeById);

    const searchGroup = this.buildSearchGroup(searchTerm);

    if (searchGroup) where.AND = [...(where.AND ?? []), searchGroup];

    return where;
  }

  private buildOrderBy({ sortDescriptor }: { sortDescriptor?: SortDescriptor | null } = {}): OrderByInput {
    if (!sortDescriptor) return [];

    const sortableFields = this.getSortableFields();
    const validatedSortDescriptor = this.validateSortDescriptor(sortDescriptor, sortableFields);

    if (!validatedSortDescriptor) return [];

    const matched = sortableFields.find((s) => s.field === validatedSortDescriptor.field);

    if (matched && matched.resolvedFields && matched.resolvedFields.length > 0) {
      const resolved = matched.resolvedFields.map((f) =>
        ((fieldPath: string) => {
          if (fieldPath.includes(".")) {
            const [relation, relField] = fieldPath.split(".");

            return { [relation]: { [relField]: validatedSortDescriptor.direction } } as unknown as Record<
              string,
              unknown
            >;
          }

          return { [fieldPath]: validatedSortDescriptor.direction } as Record<string, unknown>;
        })(f),
      );

      return resolved;
    }

    return [];
  }

  private createClause(key: string, value: unknown) {
    return { [key]: value } as TWhereInput;
  }

  private createWhere(key: string, value: unknown) {
    return { [key]: value } as TWhereInput;
  }

  private applyFieldFilter(
    where: WithDynamicFields<TWhereInput> & WithLogicalOperators<TWhereInput>,
    filter: Filter,
    filterableFields: FilterableField[],
    customColumnTypeById: Map<string, CustomColumnType>,
  ): void {
    const isCustom = isCustomField(filter.field);

    if (isCustom) {
      const fieldConfig = filterableFields.find((f) => f.field === filter.field);
      const columnType = customColumnTypeById.get(filter.field);
      const isRange = columnType === CustomColumnType.dateRange || columnType === CustomColumnType.dateTimeRange;
      const valueField = fieldConfig && isNumericField(fieldConfig.operators) ? "numericValue" : "value";
      const condition = isRange
        ? this.buildRangeRelationFilterCondition(filter)
        : this.buildFilterCondition(filter, valueField);
      where.AND = [...(where.AND ?? []), this.createClause("customFieldValues", condition)];
      return;
    }

    const relationFieldPath = getRelationFieldPath(filter.field);
    const isRelationField = relationFieldPath.includes(".");

    if (isRelationField) {
      const [relation, field] = relationFieldPath.split(".");
      const condition = this.buildFilterCondition(filter, field);

      where.AND = [...(where.AND ?? []), this.createClause(relation, condition)];

      return;
    }

    if (this.getArrayFields().has(relationFieldPath)) {
      const condition = this.buildArrayFilterCondition(filter);
      where.AND = [...(where.AND ?? []), this.createClause(relationFieldPath, condition)];
      return;
    }

    const fieldCondition = this.buildFilterCondition(filter);

    where.AND = [...(where.AND ?? []), this.createClause(filter.field, fieldCondition)];

    return;
  }

  private buildRangeRelationFilterCondition(filter: Filter) {
    const columnIdClause = { columnId: filter.field };

    switch (filter.operator) {
      case FilterOperatorKey.isNull:
        return { none: { AND: [columnIdClause, { value: { not: null } }] } };
      case FilterOperatorKey.isNotNull:
        return { some: { AND: [columnIdClause, { value: { not: null } }] } };
      case FilterOperatorKey.contains:
        return {
          some: {
            AND: [columnIdClause, { rangeStart: { lte: filter.value } }, { rangeEnd: { gte: filter.value } }],
          },
        };
      case FilterOperatorKey.gt:
        return { some: { AND: [columnIdClause, { rangeStart: { gt: filter.value } }] } };
      case FilterOperatorKey.gte:
        return { some: { AND: [columnIdClause, { rangeStart: { gte: filter.value } }] } };
      case FilterOperatorKey.lt:
        return { some: { AND: [columnIdClause, { rangeEnd: { lt: filter.value } }] } };
      case FilterOperatorKey.lte:
        return { some: { AND: [columnIdClause, { rangeEnd: { lte: filter.value } }] } };
      case FilterOperatorKey.between:
        return {
          some: {
            AND: [columnIdClause, { rangeStart: { gte: filter.value[0] } }, { rangeEnd: { lte: filter.value[1] } }],
          },
        };
      default:
        throw new Error(`Operator ${filter.operator} is not supported for range custom columns`);
    }
  }

  private buildArrayFilterCondition(filter: Filter) {
    const asArray = (v: unknown) => (Array.isArray(v) ? v : [v]);
    switch (filter.operator) {
      case FilterOperatorKey.equals:
        return { has: filter.value };
      case FilterOperatorKey.in:
        return { hasSome: asArray(filter.value) };
      case FilterOperatorKey.notIn:
        return { not: { hasSome: asArray(filter.value) } };
      case FilterOperatorKey.isNull:
        return { isEmpty: true };
      case FilterOperatorKey.isNotNull:
        return { isEmpty: false };
      default:
        throw new Error(`Operator ${filter.operator} is not supported for array fields`);
    }
  }

  private buildSearchConditions(search: string): Array<TWhereInput> {
    const fields = this.getSearchableFields();
    const arrayFields = this.getArrayFields();

    return fields.map((field) => {
      const isRelationField = field.field.includes(".");

      if (isRelationField) {
        const parts = field.field.split(".");
        const relation = parts[0];
        const remainingPath = parts.slice(1).join(".");

        function buildNestedCondition(path: string): Record<string, unknown> {
          const pathParts = path.split(".");
          if (pathParts.length === 1) return { [pathParts[0]]: { contains: search, mode: "insensitive" } };

          const [first, ...rest] = pathParts;
          return { [first]: buildNestedCondition(rest.join(".")) };
        }

        return this.createWhere(relation, {
          some: buildNestedCondition(remainingPath),
        });
      }

      if (arrayFields.has(field.field)) return this.createWhere(field.field, { has: search });

      return this.createWhere(field.field, { contains: search, mode: "insensitive" });
    });
  }

  private buildSearchGroup(searchTerm?: string | null): LogicalGroup<TWhereInput> | undefined {
    if (!searchTerm) return undefined;

    const tokens = searchTerm
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (!tokens.length) return undefined;

    const tokenGroups = tokens.map((token) => {
      const predicates = this.buildSearchConditions(token);
      return { OR: predicates };
    });

    if (tokenGroups.length === 1) return tokenGroups[0];

    return { AND: tokenGroups } as LogicalGroup<TWhereInput>;
  }

  private buildFilterCondition(filter: Filter, relationField?: string) {
    if (relationField) return this.buildRelationFilterCondition(filter, relationField);

    return this.buildScalarFilterCondition(filter);
  }

  private buildScalarFilterCondition(filter: Filter) {
    switch (filter.operator) {
      case FilterOperatorKey.equals:
        return filter.value;
      case FilterOperatorKey.contains:
        return { contains: filter.value, mode: "insensitive" };
      case FilterOperatorKey.in:
        return { in: filter.value };
      case FilterOperatorKey.notIn:
        return { notIn: filter.value };
      case FilterOperatorKey.gt:
        return { gt: filter.value };
      case FilterOperatorKey.gte:
        return { gte: filter.value };
      case FilterOperatorKey.lt:
        return { lt: filter.value };
      case FilterOperatorKey.lte:
        return { lte: filter.value };
      case FilterOperatorKey.between:
        return { gte: filter.value[0], lte: filter.value[1] };
      case FilterOperatorKey.isNull:
        return null;
      case FilterOperatorKey.isNotNull:
        return { not: null };
      case FilterOperatorKey.hasNone:
        throw new Error("hasNone should only be used for relation fields, not direct fields");
      case FilterOperatorKey.hasSome:
        throw new Error("hasSome should only be used for relation fields, not direct fields");
    }
  }

  private buildRelationFilterCondition(filter: Filter, relationField: string) {
    const isCustom = isCustomField(filter.field);

    switch (filter.operator) {
      case FilterOperatorKey.in: {
        return isCustom
          ? { some: { AND: [{ columnId: filter.field }, { [relationField]: { in: filter.value } }] } }
          : { some: { [relationField]: { in: filter.value } } };
      }
      case FilterOperatorKey.notIn: {
        return isCustom
          ? { none: { AND: [{ columnId: filter.field }, { [relationField]: { in: filter.value } }] } }
          : { none: { [relationField]: { in: filter.value } } };
      }
      case FilterOperatorKey.hasNone:
        return isCustom
          ? { none: { AND: [{ columnId: filter.field }, { [relationField]: { in: filter.value } }] } }
          : { none: { [relationField]: { in: filter.value } } };
      case FilterOperatorKey.hasSome:
        return isCustom
          ? { some: { AND: [{ columnId: filter.field }, { [relationField]: { in: filter.value } }] } }
          : { some: { [relationField]: { in: filter.value } } };
      case FilterOperatorKey.isNull:
        return isCustom
          ? { none: { AND: [{ columnId: filter.field }, { [relationField]: { not: null } }] } }
          : { none: { [relationField]: { not: null } } };
      case FilterOperatorKey.isNotNull:
        return isCustom
          ? { some: { AND: [{ columnId: filter.field }, { [relationField]: { not: null } }] } }
          : { some: { [relationField]: { not: null } } };
      default: {
        const fieldCondition = this.buildScalarFilterCondition(filter);

        return isCustom
          ? { some: { AND: [{ columnId: filter.field }, { [relationField]: fieldCondition }] } }
          : { some: { [relationField]: fieldCondition } };
      }
    }
  }
}

export type CustomSort = { columnId: string; direction: "asc" | "desc"; columnType: CustomColumnDto["type"] };

function resolveCustomSort(
  sortDescriptor: SortDescriptor | undefined,
  customColumns: CustomColumnDto[],
): CustomSort | undefined {
  if (!sortDescriptor) return undefined;
  const column = customColumns.find((c) => c.id === sortDescriptor.field);
  if (!column) return undefined;
  return { columnId: column.id, direction: sortDescriptor.direction, columnType: column.type };
}

export function compareCustomFieldValues(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc",
  columnType: CustomColumnDto["type"],
): number {
  const isMissing = (v: typeof a) => v === null || v === undefined || v === "";
  if (isMissing(a)) return isMissing(b) ? 0 : 1;
  if (isMissing(b)) return -1;

  const cmp =
    columnType === "currency"
      ? Number(a) - Number(b)
      : columnType === "date" || columnType === "dateTime"
        ? new Date(a).getTime() - new Date(b).getTime()
        : a.localeCompare(b);
  return direction === "asc" ? cmp : -cmp;
}

const COMPARISON_OPS = [FilterOperatorKey.gt, FilterOperatorKey.gte, FilterOperatorKey.lt, FilterOperatorKey.lte];

function isDateLikeField(operators: FilterOperatorKey[]): boolean {
  return operators.includes(FilterOperatorKey.between);
}

function isNumericField(operators: FilterOperatorKey[]): boolean {
  return !isDateLikeField(operators) && COMPARISON_OPS.some((op) => operators.includes(op));
}

function isFilterValueWellFormed(filter: Filter, fieldOperators: FilterOperatorKey[]): boolean {
  if (filter.operator === FilterOperatorKey.isNull || filter.operator === FilterOperatorKey.isNotNull) return true;

  const rawValue: unknown = "value" in filter ? filter.value : undefined;

  if (filter.operator === FilterOperatorKey.between) {
    if (!Array.isArray(rawValue) || rawValue.length !== 2) return false;
  } else if (Array.isArray(rawValue)) {
    if (rawValue.length === 0) return false;
  } else if (rawValue === undefined || rawValue === null || rawValue === "") return false;

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];

  if (isDateLikeField(fieldOperators))
    return values.every((v) => typeof v === "string" && !Number.isNaN(new Date(v).getTime()));

  if (isNumericField(fieldOperators))
    return values.every((v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v)));

  return true;
}
