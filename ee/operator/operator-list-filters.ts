import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";
import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupScope } from "@/core/base/grouping/group-scope";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { AppPrismaClient } from "@/prisma/db";
import type { Prisma } from "@/generated/prisma";
import type { OperatorAuditSource } from "./operator-lists.schema";

import { startOfDay, subDays } from "date-fns";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { dateBucketEntry, dateBucketLadder } from "@/core/base/grouping/date-buckets";
import { DEFAULT_DATE_BUCKET, NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import { OPERATOR_AUDIT_SOURCE } from "./operator-lists.schema";

const INTERCEPTED_FIELDS = new Set<string>([
  FilterFieldKey.plan,
  FilterFieldKey.subscriptionStatus,
  FilterFieldKey.isPlatformOperator,
  FilterFieldKey.workspaceId,
  FilterFieldKey.adProvider,
  FilterFieldKey.workspaceTags,
]);

function unsupportedGrouping(spec: GroupableFieldSpec): never {
  throw new Error(`Operator lists cannot group by ${spec.kind} (${spec.model}.${spec.field})`);
}

export function operatorCollator(): Pick<Intl.Collator, "compare"> {
  return { compare: (left, right) => (left < right ? -1 : left > right ? 1 : 0) };
}

export function groupScopeToFilters(scope: GroupScope): Filter[] | undefined {
  const { spec, key } = scope;

  switch (spec.kind) {
    case "enum": {
      if (key === NO_VALUE_GROUP_KEY) {
        return spec.nullable
          ? [{ field: spec.field, operator: FilterOperatorKey.notIn, value: [...spec.values] }]
          : undefined;
      }

      return spec.values.includes(key)
        ? [{ field: spec.field, operator: FilterOperatorKey.in, value: [key] }]
        : undefined;
    }
    case "dateBucket": {
      const entry = dateBucketEntry(
        key,
        scope.bucket ?? DEFAULT_DATE_BUCKET,
        scope.now ? new Date(scope.now) : new Date(),
      );
      if (!entry) return undefined;

      const filters: Filter[] = [];
      if (entry.start)
        filters.push({ field: spec.field, operator: FilterOperatorKey.gte, value: entry.start.toISOString() });
      if (entry.end)
        filters.push({ field: spec.field, operator: FilterOperatorKey.lt, value: entry.end.toISOString() });

      return filters;
    }
    default:
      return unsupportedGrouping(spec);
  }
}

export function applyGroupScopeAsFilters(params: GetQueryParams): GetQueryParams | undefined {
  const { groupScope, ...rest } = params;
  if (!groupScope) return rest;

  const scoped = groupScopeToFilters(groupScope);

  return scoped ? { ...rest, filters: [...(rest.filters ?? []), ...scoped] } : undefined;
}

function operatorGroupKeys(
  spec: GroupableFieldSpec,
  bucket: DateBucket | undefined,
  now: string | undefined,
): string[] {
  switch (spec.kind) {
    case "enum":
      return [...spec.values, ...(spec.nullable ? [NO_VALUE_GROUP_KEY] : [])];
    case "dateBucket":
      return dateBucketLadder(bucket ?? DEFAULT_DATE_BUCKET, now ? new Date(now) : new Date()).map(
        (entry) => entry.key,
      );
    default:
      return unsupportedGrouping(spec);
  }
}

export async function countOperatorGroups(
  spec: GroupableFieldSpec,
  bucket: DateBucket | undefined,
  now: string | undefined,
  count: (scope: GroupScope) => Promise<number>,
): Promise<GroupCountRow[]> {
  const keys = operatorGroupKeys(spec, bucket, now);
  const counts = await Promise.all(keys.map((key) => count({ spec, key, bucket, now })));

  return keys.map((key, index) => ({ key, count: counts[index] }));
}

export function filterValues(filter: Filter): string[] {
  const value = (filter as { value?: unknown }).value;
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return typeof value === "string" ? [value] : [];
}

export function negated(filter: Filter): boolean {
  return filter.operator === FilterOperatorKey.notIn;
}

function subscriptionCondition(filter: Filter, values: string[]): Prisma.SubscriptionWhereInput | undefined {
  if (filter.field === String(FilterFieldKey.plan)) {
    const plans = values.filter((value): value is SubscriptionPlan =>
      Object.values(SubscriptionPlan).includes(value as SubscriptionPlan),
    );

    return plans.length > 0 ? { plan: negated(filter) ? { notIn: plans } : { in: plans } } : undefined;
  }

  const statuses = values.filter((value): value is SubscriptionStatus =>
    Object.values(SubscriptionStatus).includes(value as SubscriptionStatus),
  );

  return statuses.length > 0 ? { status: negated(filter) ? { notIn: statuses } : { in: statuses } } : undefined;
}

type SubscriptionScope = { is: Prisma.SubscriptionWhereInput; positive: boolean } | undefined;

class SubscriptionConditions {
  private readonly conditions: Prisma.SubscriptionWhereInput[] = [];
  private positive = false;

  add(filter: Filter, values: string[]) {
    const condition = subscriptionCondition(filter, values);
    if (!condition) return;

    this.conditions.push(condition);
    if (!negated(filter)) this.positive = true;
  }

  scope(): SubscriptionScope {
    if (this.conditions.length === 0) return undefined;

    const is = this.conditions.length === 1 ? this.conditions[0] : { AND: this.conditions };

    return { is, positive: this.positive };
  }
}

export function partitionOperatorUserFilters(filters: Filter[] | undefined): {
  baseWhere: Prisma.UserWhereInput;
  passthrough: Filter[];
} {
  const passthrough: Filter[] = [];
  const subscription = new SubscriptionConditions();
  const company: Prisma.CompanyWhereInput = {};
  const baseWhere: Prisma.UserWhereInput = {};

  for (const filter of filters ?? []) {
    if (!INTERCEPTED_FIELDS.has(filter.field)) {
      passthrough.push(filter);
      continue;
    }

    const values = filterValues(filter);
    if (values.length === 0) continue;

    if (filter.field === String(FilterFieldKey.isPlatformOperator)) {
      const wanted = values.includes("true");
      const both = values.includes("true") && values.includes("false");
      if (both) continue;
      baseWhere.isPlatformOperator = negated(filter) ? !wanted : wanted;
      continue;
    }

    if (filter.field === String(FilterFieldKey.adProvider)) {
      baseWhere.adAttributions = negated(filter)
        ? { none: { provider: { in: values } } }
        : { some: { provider: { in: values } } };
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceId)) {
      baseWhere.companyId = negated(filter) ? { notIn: values } : { in: values };
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceTags)) {
      if (negated(filter)) baseWhere.NOT = { company: { tags: { hasSome: values } } };
      else company.tags = { hasSome: values };
      continue;
    }

    subscription.add(filter, values);
  }

  const scope = subscription.scope();
  if (scope) {
    if (scope.positive) company.subscription = { is: scope.is };
    else baseWhere.OR = [{ company: { subscription: { is: scope.is } } }, { company: { subscription: { is: null } } }];
  }

  if (Object.keys(company).length > 0) baseWhere.company = company;

  return { baseWhere, passthrough };
}

export function partitionOperatorWorkspaceFilters(filters: Filter[] | undefined): {
  baseWhere: Prisma.CompanyWhereInput;
  passthrough: Filter[];
} {
  const passthrough: Filter[] = [];
  const subscription = new SubscriptionConditions();
  const baseWhere: Prisma.CompanyWhereInput = {};

  for (const filter of filters ?? []) {
    if (filter.field === String(FilterFieldKey.workspaceId)) {
      const values = filterValues(filter);
      if (values.length > 0) baseWhere.id = negated(filter) ? { notIn: values } : { in: values };
      continue;
    }

    if (filter.field === String(FilterFieldKey.adProvider)) {
      const values = filterValues(filter);
      if (values.length > 0) {
        baseWhere.adAttributions = negated(filter)
          ? { none: { provider: { in: values } } }
          : { some: { provider: { in: values } } };
      }
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceTags)) {
      const values = filterValues(filter);
      if (values.length > 0) {
        if (negated(filter)) baseWhere.NOT = { tags: { hasSome: values } };
        else baseWhere.tags = { hasSome: values };
      }
      continue;
    }

    if (filter.field !== String(FilterFieldKey.plan) && filter.field !== String(FilterFieldKey.subscriptionStatus)) {
      passthrough.push(filter);
      continue;
    }

    subscription.add(filter, filterValues(filter));
  }

  const scope = subscription.scope();
  if (scope) {
    if (scope.positive) baseWhere.subscription = { is: scope.is };
    else baseWhere.OR = [{ subscription: { is: scope.is } }, { subscription: { is: null } }];
  }

  return { baseWhere, passthrough };
}

export function createdAtFilter(filter: Filter): Prisma.DateTimeFilter | undefined {
  const raw = (filter as { value?: unknown }).value;
  const toDate = (value: unknown) => (typeof value === "string" || value instanceof Date ? new Date(value) : undefined);

  switch (filter.operator) {
    case FilterOperatorKey.inLastDays: {
      const days = Number(raw);
      return Number.isInteger(days) && days > 0 ? { gte: startOfDay(subDays(new Date(), days)) } : undefined;
    }
    case FilterOperatorKey.between:
      return Array.isArray(raw) ? { gte: toDate(raw[0]), lte: toDate(raw[1]) } : undefined;
    case FilterOperatorKey.gt:
      return { gt: toDate(raw) };
    case FilterOperatorKey.gte:
      return { gte: toDate(raw) };
    case FilterOperatorKey.lt:
      return { lt: toDate(raw) };
    case FilterOperatorKey.lte:
      return { lte: toDate(raw) };
    default:
      return undefined;
  }
}

export type OperatorAuditFilterPlan = {
  sources: OperatorAuditSource[];
  workspaceIds: string[] | null;
  createdAt: Prisma.DateTimeFilter[];
};

export function planOperatorAuditFilters(filters: Filter[] | undefined): OperatorAuditFilterPlan {
  let sources: OperatorAuditSource[] = [OPERATOR_AUDIT_SOURCE.product, OPERATOR_AUDIT_SOURCE.operator];
  let workspaceIds: string[] | null = null;
  const createdAt: Prisma.DateTimeFilter[] = [];

  for (const filter of filters ?? []) {
    if (filter.field === String(FilterFieldKey.auditSource)) {
      const values = filterValues(filter).filter(
        (value): value is OperatorAuditSource =>
          value === OPERATOR_AUDIT_SOURCE.product || value === OPERATOR_AUDIT_SOURCE.operator,
      );
      if (values.length === 0) continue;
      sources = sources.filter((source) => values.includes(source) !== negated(filter));
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceId)) {
      const values = filterValues(filter);
      if (values.length > 0 && !negated(filter)) workspaceIds = values;
      continue;
    }

    if (filter.field === String(FilterFieldKey.createdAt)) {
      const range = createdAtFilter(filter);
      if (range) createdAt.push(range);
    }
  }

  return { sources, workspaceIds, createdAt };
}

export async function resolveWorkspaceOwners(
  prisma: AppPrismaClient,
  companyIds: string[],
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  if (companyIds.length === 0) return owners;

  const rows = await prisma.$queryRaw<Array<{ companyId: string; owner: string | null }>>`
    SELECT DISTINCT ON (u."companyId")
      u."companyId" AS "companyId",
      u."email" AS "owner"
    FROM "User" AS u
    LEFT JOIN "UserRole" AS r ON r."id" = u."roleId"
    WHERE u."companyId" = ANY(${companyIds}::text[])
    ORDER BY
      u."companyId" ASC,
      (u."status"::text = 'active') DESC,
      (r."isSystemRole" IS TRUE) DESC,
      u."createdAt" ASC
  `;

  for (const row of rows) if (row.owner) owners.set(row.companyId, row.owner);

  return owners;
}

export async function resolveWorkspaceLabels(
  prisma: AppPrismaClient,
  companyIds: string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (companyIds.length === 0) return labels;

  const rows = await prisma.$queryRaw<Array<{ companyId: string; domain: string | null }>>`
    SELECT DISTINCT ON ("companyId") "companyId", split_part("email", '@', 2) AS domain
    FROM "User"
    WHERE "companyId" = ANY(${companyIds}::text[])
    GROUP BY "companyId", domain
    ORDER BY "companyId" ASC, COUNT(*) DESC, domain ASC
  `;

  for (const row of rows) if (row.domain) labels.set(row.companyId, row.domain);

  return labels;
}
