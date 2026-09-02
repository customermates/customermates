import type { Filter } from "@/core/base/base-get.schema";
import type { AppPrismaClient } from "@/prisma/db";
import type { Prisma } from "@/generated/prisma";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

const INTERCEPTED_FIELDS = new Set<string>([
  FilterFieldKey.plan,
  FilterFieldKey.subscriptionStatus,
  FilterFieldKey.isPlatformOperator,
  FilterFieldKey.workspaceId,
  FilterFieldKey.workspaceTags,
]);

export function filterValues(filter: Filter): string[] {
  const value = (filter as { value?: unknown }).value;
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return typeof value === "string" ? [value] : [];
}

export function negated(filter: Filter): boolean {
  return filter.operator === FilterOperatorKey.notIn;
}

export function partitionOperatorUserFilters(filters: Filter[] | undefined): {
  baseWhere: Prisma.UserWhereInput;
  passthrough: Filter[];
} {
  const passthrough: Filter[] = [];
  const subscription: Prisma.SubscriptionWhereInput = {};
  const company: Prisma.CompanyWhereInput = {};
  const baseWhere: Prisma.UserWhereInput = {};
  let hasPositiveSubscriptionCondition = false;

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

    if (filter.field === String(FilterFieldKey.workspaceId)) {
      baseWhere.companyId = negated(filter) ? { notIn: values } : { in: values };
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceTags)) {
      if (negated(filter)) baseWhere.NOT = { company: { tags: { hasSome: values } } };
      else company.tags = { hasSome: values };
      continue;
    }

    if (filter.field === String(FilterFieldKey.plan)) {
      const plans = values.filter((value): value is SubscriptionPlan =>
        Object.values(SubscriptionPlan).includes(value as SubscriptionPlan),
      );
      if (plans.length > 0) {
        subscription.plan = negated(filter) ? { notIn: plans } : { in: plans };
        if (!negated(filter)) hasPositiveSubscriptionCondition = true;
      }
      continue;
    }

    const statuses = values.filter((value): value is SubscriptionStatus =>
      Object.values(SubscriptionStatus).includes(value as SubscriptionStatus),
    );
    if (statuses.length > 0) {
      subscription.status = negated(filter) ? { notIn: statuses } : { in: statuses };
      if (!negated(filter)) hasPositiveSubscriptionCondition = true;
    }
  }

  if (Object.keys(subscription).length > 0) {
    if (hasPositiveSubscriptionCondition) company.subscription = { is: subscription };
    else
      baseWhere.OR = [{ company: { subscription: { is: subscription } } }, { company: { subscription: { is: null } } }];
  }

  if (Object.keys(company).length > 0) baseWhere.company = company;

  return { baseWhere, passthrough };
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
