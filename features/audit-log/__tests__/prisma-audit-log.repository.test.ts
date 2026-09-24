import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Action, Resource } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { DomainEvent } from "@/features/event/domain-events";
import { WIKI_PAGE_AUDIT_EVENTS } from "@/features/wiki/wiki-audit-events";

const database = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/prisma/db", () => ({
  prisma: { auditLog: database },
}));

import { PrismaAuditLogRepo } from "../prisma-audit-log.repository";

beforeEach(() => vi.clearAllMocks());

describe("PrismaAuditLogRepo Wiki visibility", () => {
  it.each([
    ["getItems", "findMany"],
    ["getCount", "count"],
  ] as const)("requires Wiki Read in addition to Audit Log access for %s", async (method, prismaMethod) => {
    const user = createMockUserWithPermissions([{ resource: Resource.auditLog, action: Action.readAll }]);

    await runWithTenant(user, async () => {
      const repo = new PrismaAuditLogRepo();
      if (method === "getItems") await repo.getItems({});
      else await repo.getCount({});
    });

    expect(database[prismaMethod]).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: user.companyId,
          event: { notIn: [...WIKI_PAGE_AUDIT_EVENTS] },
        }),
      }),
    );
  });

  it.each([
    ["getItems", "findMany"],
    ["getCount", "count"],
  ] as const)("cannot reveal Wiki events through an explicit event filter for %s", async (method, prismaMethod) => {
    const user = createMockUserWithPermissions([{ resource: Resource.auditLog, action: Action.readAll }]);
    const params: GetQueryParams = {
      filters: [
        {
          field: FilterFieldKey.event,
          operator: FilterOperatorKey.in,
          value: [DomainEvent.WIKI_PAGE_CREATED],
        },
      ],
    };

    await runWithTenant(user, async () => {
      const repo = new PrismaAuditLogRepo();
      if (method === "getItems") await repo.getItems(params);
      else await repo.getCount(params);
    });

    expect(database[prismaMethod]).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: user.companyId,
          event: { notIn: [...WIKI_PAGE_AUDIT_EVENTS] },
          AND: [{ event: { in: [DomainEvent.WIKI_PAGE_CREATED] } }],
        }),
      }),
    );
  });

  it.each([
    ["getItems", "findMany"],
    ["getCount", "count"],
  ] as const)(
    "keeps the tenant boundary but removes the Wiki exclusion for %s when Read is granted",
    async (method, prismaMethod) => {
      const user = createMockUserWithPermissions([
        { resource: Resource.auditLog, action: Action.readAll },
        { resource: Resource.wiki, action: Action.readAll },
      ]);

      await runWithTenant(user, async () => {
        const repo = new PrismaAuditLogRepo();
        if (method === "getItems") await repo.getItems({});
        else await repo.getCount({});
      });

      const where = database[prismaMethod].mock.calls[0][0].where;
      expect(where.companyId).toBe(user.companyId);
      expect(JSON.stringify(where)).not.toContain("wiki_page.");
    },
  );
});
