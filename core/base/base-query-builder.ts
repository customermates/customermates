import type {
  Filter,
  FilterableField,
  GetQueryParams,
  PaginationRequest,
  SortDescriptor,
} from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { z } from "zod";

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
  [FilterFieldKey.contactIds]: "contacts.id",
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

  async buildQueryArgs(params: GetQueryParams, baseWhere: TWhereInput = {} as TWhereInput) {
    const where = await this.buildWhereClause(params.filters, params.searchTerm, baseWhere);
    const orderBy = this.buildOrderBy({ sortDescriptor: params.sortDescriptor });
    const pagination = this.buildPagination(params.pagination);

    return { where, orderBy, ...pagination };
  }

  validateFilters(filters: Filter[] | undefined, filterableFields: FilterableField[]): Filter[] {
    if (!Array.isArray(filters)) return [];

    return filters.filter((filter) => {
      const hasValidStructure =
        filter &&
        typeof filter === "object" &&
        filter.field &&
        typeof filter.field === "string" &&
        filter.operator &&
        typeof filter.operator === "string";

      if (!hasValidStructure) return false;

      return filterableFields.some((f) => f.field === filter.field && f.operators.includes(filter.operator));
    });
  }

  validateSortDescriptor(
    sortDescriptor: SortDescriptor | undefined,
    sortableFields: SortableField[],
  ): SortDescriptor | undefined {
    if (!sortDescriptor) return undefined;
    if (!sortDescriptor || typeof sortDescriptor !== "object") return undefined;
    if (!sortDescriptor.field || typeof sortDescriptor.field !== "string") return undefined;
    if (!sortDescriptor.direction || typeof sortDescriptor.direction !== "string") return undefined;

    const validDirections = ["asc", "desc"];
    const isValidDirection = validDirections.includes(sortDescriptor.direction);
    if (!isValidDirection) return undefined;

    const matched = sortableFields.find((s) => s.field === sortDescriptor.field);
    return matched ? sortDescriptor : undefined;
  }

  private buildPagination(pagination?: PaginationRequest | null) {
    if (!pagination) return { skip: 0, take: 1000 };

    const pageSize = pagination.pageSize ?? 1000;
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

    for (const filter of validFilters) this.applyFieldFilter(where, filter);

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
  ): void {
    const isCustom = isCustomField(filter.field);

    if (isCustom) {
      const condition = this.buildFilterCondition(filter, "value");
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

    const fieldCondition = this.buildFilterCondition(filter);

    where.AND = [...(where.AND ?? []), this.createClause(filter.field, fieldCondition)];

    return;
  }

  private buildSearchConditions(search: string): Array<TWhereInput> {
    const fields = this.getSearchableFields();

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
        return { none: {} };
      case FilterOperatorKey.hasSome:
        return { some: {} };
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
