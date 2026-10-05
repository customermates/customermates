import type {
  Filter,
  FilterableField,
  GetQueryParams,
  PaginationRequest,
  SortDescriptor,
} from "@/core/base/base-get.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { startOfDay, subDays } from "date-fns";

import { normalizeFilter } from "@/core/base/filter-compat";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export interface SortableField {
  field: string;
  resolvedFields: string[];
  collate?: boolean;
  nullable?: boolean;
}

export type TextSort = {
  fields: string[];
  direction: "asc" | "desc";
};

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
  startsWith = "startsWith",
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
  hasUnset = "hasUnset",
  allSet = "allSet",
  inLastDays = "inLastDays",
  notInLastDays = "notInLastDays",
}

type LogicalGroup<T> = { OR: T[] } | { AND: Array<{ OR: T[] }> };

type WithLogicalOperators<T> = T & {
  AND?: Array<T | LogicalGroup<T>>;
  OR?: T[];
};

type WithDynamicFields<T> = T & {
  [K: string]: unknown;
};

type OrderByInput = Record<string, unknown>[];

const FILTER_COLUMN: Partial<Record<string, string>> = {
  [FilterFieldKey.workspaceId]: "companyId",
  [FilterFieldKey.workspaceTags]: "tags",
};

export abstract class BaseQueryBuilder<TWhereInput extends Record<string, unknown> = Record<string, unknown>> {
  getSearchableFields(): Array<SearchableField> {
    return [];
  }

  getSortableFields(): Array<SortableField> {
    return [];
  }

  getFilterableFields(): Promise<Array<FilterableField>> {
    return Promise.resolve([]);
  }

  private memoFilterableFields?: Promise<Array<FilterableField>>;

  filterableFieldsOnce(): Promise<Array<FilterableField>> {
    this.memoFilterableFields ??= this.getFilterableFields();
    return this.memoFilterableFields;
  }

  getGroupableFields(): Promise<Array<GroupableFieldSpec>> {
    return Promise.resolve([]);
  }

  async buildQueryArgs(params: GetQueryParams, baseWhere: TWhereInput = {} as TWhereInput) {
    const where = await this.buildWhereClause(params, baseWhere);
    const textSort = this.resolveTextSort(params.sortDescriptor);
    const orderBy = textSort ? [] : this.buildOrderBy({ sortDescriptor: params.sortDescriptor });
    const pagination =
      params.take !== undefined || params.skip !== undefined
        ? { skip: params.skip ?? 0, take: params.take ?? 100 }
        : this.buildPagination(params.pagination);

    return { where, orderBy, textSort, ...pagination };
  }

  private resolveTextSort(sortDescriptor: SortDescriptor | undefined): TextSort | undefined {
    const sortableFields = this.getSortableFields();
    const validated = this.validateSortDescriptor({
      sortDescriptor,
      sortableFields,
    });
    if (!validated) return undefined;

    const matched = sortableFields.find((s) => s.field === validated.field);
    if (!matched?.collate) return undefined;

    return { fields: matched.resolvedFields, direction: validated.direction };
  }

  validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[] {
    return defaultValidateFilters(args);
  }

  validateSortDescriptor(args: {
    sortDescriptor: SortDescriptor | undefined;
    sortableFields: SortableField[];
  }): SortDescriptor | undefined {
    const { sortDescriptor, sortableFields } = args;
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
    if (!pagination) return { skip: 0, take: 100 };

    const pageSize = pagination.pageSize ?? 100;
    const page = pagination.page ?? 1;

    return {
      skip: (page - 1) * pageSize,
      take: pageSize,
    };
  }

  private async buildWhereClause(
    params: GetQueryParams,
    baseWhere: TWhereInput = {} as TWhereInput,
  ): Promise<TWhereInput> {
    const where = { ...baseWhere } as WithDynamicFields<TWhereInput> & WithLogicalOperators<TWhereInput>;
    const filterableFields = await this.filterableFieldsOnce();
    const validFilters = this.validateFilters({
      filters: params.filters,
      filterableFields,
    });

    for (const filter of validFilters) this.applyFieldFilter(where, filter);

    const searchGroup = this.buildSearchGroup(params.searchTerm);

    if (searchGroup) where.AND = [...(where.AND ?? []), searchGroup];

    return where;
  }

  protected getDefaultOrderBy(): OrderByInput {
    return [{ id: "desc" }];
  }

  protected withIdTiebreaker(orderBy: OrderByInput, direction: "asc" | "desc"): OrderByInput {
    if (orderBy.some((clause) => "id" in clause)) return orderBy;
    return [...orderBy, { id: direction }];
  }

  private buildOrderBy({ sortDescriptor }: { sortDescriptor?: SortDescriptor | null } = {}): OrderByInput {
    if (!sortDescriptor) return this.getDefaultOrderBy();

    const sortableFields = this.getSortableFields();
    const validatedSortDescriptor = this.validateSortDescriptor({
      sortDescriptor,
      sortableFields,
    });

    if (!validatedSortDescriptor) return this.getDefaultOrderBy();

    const matched = sortableFields.find((s) => s.field === validatedSortDescriptor.field);

    if (matched && matched.resolvedFields && matched.resolvedFields.length > 0) {
      const order = matched.nullable
        ? { sort: validatedSortDescriptor.direction, nulls: "last" }
        : validatedSortDescriptor.direction;
      const resolved = matched.resolvedFields.map((f) =>
        ((fieldPath: string) => {
          if (fieldPath.includes(".")) {
            const [relation, relField] = fieldPath.split(".");

            return {
              [relation]: { [relField]: order },
            } as unknown as Record<string, unknown>;
          }

          return { [fieldPath]: order } as Record<string, unknown>;
        })(f),
      );

      return this.withIdTiebreaker(resolved, validatedSortDescriptor.direction);
    }

    return this.getDefaultOrderBy();
  }

  private createClause(key: string, value: unknown) {
    return { [key]: value } as TWhereInput;
  }

  private applyFieldFilter(
    where: WithDynamicFields<TWhereInput> & WithLogicalOperators<TWhereInput>,
    filter: Filter,
  ): void {
    const column = FILTER_COLUMN[filter.field] ?? filter.field;

    where.AND = [...(where.AND ?? []), this.createClause(column, this.buildScalarFilterCondition(filter))];
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
          if (pathParts.length === 1) {
            return {
              [pathParts[0]]: { contains: search, mode: "insensitive" },
            };
          }

          const [first, ...rest] = pathParts;
          return { [first]: buildNestedCondition(rest.join(".")) };
        }

        return this.createClause(relation, {
          some: buildNestedCondition(remainingPath),
        });
      }

      return this.createClause(field.field, {
        contains: search,
        mode: "insensitive",
      });
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

  private buildScalarFilterCondition(filter: Filter) {
    switch (filter.operator) {
      case FilterOperatorKey.equals:
        return filter.value;
      case FilterOperatorKey.contains:
        return { contains: filter.value, mode: "insensitive" };
      case FilterOperatorKey.startsWith:
        return { startsWith: filter.value, mode: "insensitive" };
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
      case FilterOperatorKey.inLastDays:
        return { gte: startOfDay(subDays(new Date(), Number(filter.value))) };
      case FilterOperatorKey.notInLastDays:
        return { lt: startOfDay(subDays(new Date(), Number(filter.value))) };
      case FilterOperatorKey.isNull:
        return null;
      case FilterOperatorKey.isNotNull:
        return { not: null };
      case FilterOperatorKey.hasNone:
        throw new Error("hasNone should only be used for relation fields, not direct fields");
      case FilterOperatorKey.hasSome:
        throw new Error("hasSome should only be used for relation fields, not direct fields");
      case FilterOperatorKey.hasUnset:
        throw new Error("hasUnset should only be used for relation fields, not direct fields");
      case FilterOperatorKey.allSet:
        throw new Error("allSet should only be used for relation fields, not direct fields");
    }
  }
}

function isMissingSortValue(value: unknown): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

export function compareSortValues(
  a: readonly unknown[],
  b: readonly unknown[],
  direction: "asc" | "desc",
  collator: Pick<Intl.Collator, "compare">,
): number {
  for (const [index, left] of a.entries()) {
    const right = b[index];
    if (isMissingSortValue(left) || isMissingSortValue(right)) {
      if (isMissingSortValue(left) && isMissingSortValue(right)) continue;
      return isMissingSortValue(left) ? 1 : -1;
    }

    const cmp =
      typeof left === "string" && typeof right === "string"
        ? collator.compare(left, right)
        : Number(left) - Number(right);
    if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
  }

  return 0;
}

const COMPARISON_OPS = [FilterOperatorKey.gt, FilterOperatorKey.gte, FilterOperatorKey.lt, FilterOperatorKey.lte];

function isDateLikeField(operators: FilterOperatorKey[]): boolean {
  return operators.includes(FilterOperatorKey.between);
}

function isNumericField(operators: FilterOperatorKey[]): boolean {
  return !isDateLikeField(operators) && COMPARISON_OPS.some((op) => operators.includes(op));
}

export function defaultValidateFilters(args: {
  filters: Filter[] | undefined;
  filterableFields: FilterableField[];
}): Filter[] {
  const { filters, filterableFields } = args;
  if (!Array.isArray(filters)) return [];

  const result: Filter[] = [];

  for (const candidate of filters) {
    const hasValidStructure =
      candidate &&
      typeof candidate === "object" &&
      candidate.field &&
      typeof candidate.field === "string" &&
      candidate.operator &&
      typeof candidate.operator === "string";

    if (!hasValidStructure) continue;

    const filter = normalizeFilter(candidate);
    const fieldConfig = filterableFields.find((f) => f.field === filter.field);
    if (!fieldConfig || !fieldConfig.operators.includes(filter.operator)) continue;

    if (!isFilterValueWellFormed(filter, fieldConfig.operators)) continue;

    result.push(filter);
  }

  return result;
}

export function isStandaloneOperator(operator?: FilterOperatorKey) {
  if (!operator) return false;

  return [
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
    FilterOperatorKey.hasNone,
    FilterOperatorKey.hasSome,
    FilterOperatorKey.hasUnset,
    FilterOperatorKey.allSet,
  ].includes(operator);
}

function isFilterValueWellFormed(filter: Filter, fieldOperators: FilterOperatorKey[]): boolean {
  if (isStandaloneOperator(filter.operator)) {
    const isRelationshipExistence =
      filter.operator === FilterOperatorKey.hasNone || filter.operator === FilterOperatorKey.hasSome;
    return !isRelationshipExistence || !("value" in filter) || filter.value === undefined;
  }

  const rawValue: unknown = "value" in filter ? filter.value : undefined;

  if (filter.operator === FilterOperatorKey.inLastDays || filter.operator === FilterOperatorKey.notInLastDays) {
    const n = Number(rawValue);
    return Number.isInteger(n) && n > 0;
  }

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
