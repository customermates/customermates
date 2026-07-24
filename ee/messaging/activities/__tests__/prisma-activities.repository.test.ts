import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Filter } from "@/core/base/base-get.schema";

import { Action, Resource } from "@/generated/prisma";

import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const { fake } = vi.hoisted(() => {
  const calls: Record<string, { op: string; args: any }[]> = {
    auditLog: [],
    messagingMessage: [],
    accountActivity: [],
    calendarEvent: [],
  };

  const model = (name: string) => ({
    findMany: (args: any) => {
      calls[name].push({ op: "findMany", args });
      return Promise.resolve([]);
    },
    count: (args: any) => {
      calls[name].push({ op: "count", args });
      return Promise.resolve(0);
    },
  });

  return {
    fake: {
      calls,
      reset() {
        for (const key of Object.keys(calls)) calls[key].length = 0;
      },
      prisma: {
        auditLog: model("auditLog"),
        messagingMessage: model("messagingMessage"),
        accountActivity: model("accountActivity"),
        calendarEvent: model("calendarEvent"),
      },
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getContactRepo: () => ({}),
  getCustomColumnRepo: () => ({ findByEntityType: () => Promise.resolve([]) }),
}));

import { PrismaActivitiesRepo } from "../prisma-activities.repository";

const A = "16000000-0000-4000-8000-000000000001";

const messagesAndAudit = () =>
  createMockUserWithPermissions([
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.auditLog, action: Action.readAll },
  ]);

const called = (name: string) => fake.calls[name].length > 0;
const whereOf = (name: string, op: string) => fake.calls[name].find((c) => c.op === op)?.args?.where;

function channelClause(where: any): { in?: string[]; notIn?: string[] } | undefined {
  if (where?.connectedAccountId) return where.connectedAccountId;
  if (Array.isArray(where?.AND))
    for (const clause of where.AND) if (clause?.connectedAccountId) return clause.connectedAccountId;
  return undefined;
}

function providerRelation(where: any): string[] | undefined {
  if (Array.isArray(where?.AND)) {
    for (const clause of where.AND)
      if (clause?.connectedAccount?.provider?.in) return clause.connectedAccount.provider.in;
  }
  return undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
});

describe("PrismaActivitiesRepo.getFilterableFields — permission visibility", () => {
  it("exposes the channel filter to message-permitted viewers", async () => {
    const fields = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readAll }]),
      () => new PrismaActivitiesRepo().getFilterableFields(),
    );

    expect(fields.map((f) => f.field)).toContain(FilterFieldKey.connectedAccountId);
  });

  it("hides the channel filter from an audit-only viewer", async () => {
    const fields = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.auditLog, action: Action.readAll }]),
      () => new PrismaActivitiesRepo().getFilterableFields(),
    );

    expect(fields.map((f) => f.field)).toEqual([FilterFieldKey.timelineKind]);
  });

  it("returns no filters to a viewer without messaging or audit permission", async () => {
    const fields = await runWithTenant(createMockUserWithPermissions([]), () =>
      new PrismaActivitiesRepo().getFilterableFields(),
    );

    expect(fields).toEqual([]);
  });
});

describe("PrismaActivitiesRepo — channel filter application", () => {
  const channelFilter: Filter[] = [
    { field: FilterFieldKey.connectedAccountId, operator: FilterOperatorKey.in, value: [A] },
  ];

  it("suppresses audit and applies the channel predicate to every channel-backed source (getCount)", async () => {
    await runWithTenant(messagesAndAudit(), () => new PrismaActivitiesRepo().getCount({ filters: channelFilter }));

    expect(called("auditLog")).toBe(false);
    expect(channelClause(whereOf("messagingMessage", "count"))?.in).toEqual([A]);
    expect(channelClause(whereOf("accountActivity", "count"))?.in).toEqual([A]);
    expect(channelClause(whereOf("calendarEvent", "count"))?.in).toEqual([A]);
  });

  it("applies the identical channel predicate in getItems (item/count predicate parity)", async () => {
    await runWithTenant(messagesAndAudit(), () => new PrismaActivitiesRepo().getItems({ filters: channelFilter }));

    expect(called("auditLog")).toBe(false);
    expect(channelClause(whereOf("messagingMessage", "findMany"))?.in).toEqual([A]);
    expect(channelClause(whereOf("accountActivity", "findMany"))?.in).toEqual([A]);
    expect(channelClause(whereOf("calendarEvent", "findMany"))?.in).toEqual([A]);
  });

  it("keeps audit in the feed when no provider or channel filter is active", async () => {
    await runWithTenant(messagesAndAudit(), () => new PrismaActivitiesRepo().getCount({}));

    expect(called("auditLog")).toBe(true);
  });

  it("supports notIn to exclude a channel", async () => {
    await runWithTenant(messagesAndAudit(), () =>
      new PrismaActivitiesRepo().getCount({
        filters: [{ field: FilterFieldKey.connectedAccountId, operator: FilterOperatorKey.notIn, value: [A] }],
      }),
    );

    expect(channelClause(whereOf("messagingMessage", "count"))?.notIn).toEqual([A]);
    expect(channelClause(whereOf("accountActivity", "count"))?.notIn).toEqual([A]);
  });
});

describe("PrismaActivitiesRepo — provider consistency across channel-backed sources", () => {
  it("applies the provider filter to messages (direct), account-activity + calendar (relation), and suppresses audit", async () => {
    await runWithTenant(messagesAndAudit(), () =>
      new PrismaActivitiesRepo().getCount({
        filters: [{ field: FilterFieldKey.provider, operator: FilterOperatorKey.in, value: ["google"] }],
      }),
    );

    expect(called("auditLog")).toBe(false);
    expect(whereOf("messagingMessage", "count").provider.in).toEqual(["google"]);
    expect(providerRelation(whereOf("accountActivity", "count"))).toEqual(["google"]);
    expect(providerRelation(whereOf("calendarEvent", "count"))).toEqual(["google"]);
  });
});
