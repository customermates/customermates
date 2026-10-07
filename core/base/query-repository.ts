import type { Filter, FilterableField, GetQueryParams, PaginationRequest, SortDescriptor } from "./base-get.schema";
import type { SearchableField, SortableField, TextSort } from "./base-query-builder";
import type { GroupableFieldSpec } from "./grouping/groupable-field";

import { startOfDay, subDays } from "date-fns";

import { resolveUserFormattingTag, resolveUserLocale } from "@/i18n/user-locale";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import { compareSortValues, defaultValidateFilters, FilterOperatorKey } from "./base-query-builder";
import { TenantRepository } from "./tenant-repository";

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

export abstract class QueryRepository<
  TWhereInput extends Record<string, unknown> = Record<string, unknown>,
> extends TenantRepository {
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

  async list<TRow extends { id: string }, TMapped>(opts: {
    model: ListableModel;
    baseWhere: TWhereInput;
    select: unknown;
    params: GetQueryParams;
    map: (row: TRow) => TMapped;
  }): Promise<TMapped[]> {
    const delegate = (this.prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[
      opts.model
    ];
    const findMany = (args: unknown): Promise<TRow[]> => delegate.findMany(args) as Promise<TRow[]>;

    const args = await this.buildQueryArgs(opts.params, opts.baseWhere);
    const inMemorySort = args.textSort && this.textFieldSort(args.textSort);

    if (inMemorySort) {
      const candidates = (await delegate.findMany({
        where: args.where,
        orderBy: { id: inMemorySort.direction },
        select: { id: true, ...inMemorySort.select },
      })) as SortCandidate[];
      candidates.sort(inMemorySort.compare);

      const sortedIds = candidates.slice(args.skip, args.skip + args.take).map((c) => c.id as string);
      if (sortedIds.length === 0) return [];

      const fetched = await findMany({
        where: { id: { in: sortedIds }, ...opts.baseWhere },
        select: opts.select,
      });
      const byId = new Map(fetched.map((row) => [row.id, row]));
      return sortedIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [opts.map(row)] : [];
      });
    }

    const rows = await findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
      select: opts.select,
    });
    return rows.map(opts.map);
  }

  collator(): Pick<Intl.Collator, "compare"> {
    return new Intl.Collator(resolveUserFormattingTag(this.user, resolveUserLocale(this.user)));
  }

  private textFieldSort(sort: TextSort): InMemorySort {
    const collator = this.collator();
    const values = (row: SortCandidate) => sort.fields.map((field) => row[field]);

    return {
      direction: sort.direction,
      select: Object.fromEntries(sort.fields.map((field) => [field, true])),
      compare: (a, b) => compareSortValues(values(a), values(b), sort.direction, collator),
    };
  }
}

type ListableModel = "messagingThread" | "routine" | "calendar" | "user" | "userRole" | "webhook";

type SortCandidate = Record<string, unknown>;

type InMemorySort = {
  direction: "asc" | "desc";
  select: Record<string, unknown>;
  compare: (a: SortCandidate, b: SortCandidate) => number;
};
