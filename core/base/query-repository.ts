import type { TenantUser } from "@/features/user/user.schema";
import type { GetQueryParams } from "./base-get.schema";
import type { TextSort } from "./base-query-builder";

import { resolveUserFormattingTag, resolveUserLocale } from "@/i18n/user-locale";

import { BaseQueryBuilder, compareSortValues } from "./base-query-builder";
import { runAfterCommit, tenantPrisma, tenantUser, withCompanyTransaction } from "./tenant-repository";

export abstract class QueryRepository<
  TWhereInput extends Record<string, unknown> = Record<string, unknown>,
> extends BaseQueryBuilder<TWhereInput> {
  public get prisma() {
    return tenantPrisma();
  }

  public get user(): TenantUser {
    return tenantUser();
  }

  public get companyId(): string {
    return this.user.companyId;
  }

  public get userId(): string {
    return this.user.id;
  }

  protected runAfterCommit(fn: () => Promise<void>): Promise<void> {
    return runAfterCommit(fn);
  }

  protected withCompanyTransaction<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    return withCompanyTransaction(companyId, fn);
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
