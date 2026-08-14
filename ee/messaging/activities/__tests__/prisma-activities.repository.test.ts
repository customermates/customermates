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
    connectedAccount: [],
    messagingThread: [],
  };

  const folderStates: Array<{ id: string; selectedFolderIds: string[] }> = [];

  const model = (name: string) => ({
    findMany: (args: any) => {
      calls[name].push({ op: "findMany", args });
      if (name === "connectedAccount") return Promise.resolve(folderStates);
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
      folderStates,
      reset() {
        for (const key of Object.keys(calls)) calls[key].length = 0;
        folderStates.length = 0;
      },
      prisma: {
        auditLog: model("auditLog"),
        messagingMessage: model("messagingMessage"),
        accountActivity: model("accountActivity"),
        calendarEvent: model("calendarEvent"),
        connectedAccount: model("connectedAccount"),
        messagingThread: model("messagingThread"),
      },
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getContactRepo: () => ({}),
  getCustomColumnRepo: () => ({ getCustomColumns: () => Promise.resolve([]) }),
}));

import { PrismaActivitiesRepo } from "../prisma-activities.repository";

function messagingRepo() {
  const repo = new PrismaActivitiesRepo();
  repo.setMessagingSourcesEnabled(true);
  return repo;
}

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

describe("PrismaActivitiesRepo.getFilterableFields permission visibility", () => {
  it("exposes the channel filter to message-permitted viewers", async () => {
    const fields = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readAll }]),
      () => messagingRepo().getFilterableFields(),
    );

    expect(fields.map((f) => f.field)).toContain(FilterFieldKey.connectedAccountId);
  });

  it("hides the channel filter from an audit-only viewer", async () => {
    const fields = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.auditLog, action: Action.readAll }]),
      () => messagingRepo().getFilterableFields(),
    );

    expect(fields.map((f) => f.field)).toEqual([FilterFieldKey.timelineKind]);
  });

  it("returns no filters to a viewer without messaging or audit permission", async () => {
    const fields = await runWithTenant(createMockUserWithPermissions([]), () => messagingRepo().getFilterableFields());

    expect(fields).toEqual([]);
  });

  it("keeps a recognized messaging constraint after inbox permission is removed", async () => {
    const filter: Filter = {
      field: FilterFieldKey.provider,
      operator: FilterOperatorKey.in,
      value: ["gmail"],
    };

    const kept = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.auditLog, action: Action.readAll }]),
      async () => {
        const repo = messagingRepo();
        const visible = await repo.getFilterableFields();
        return repo.validateFilters({
          filters: [filter],
          filterableFields: visible,
        });
      },
    );

    expect(kept).toEqual([filter]);
  });
});

describe("PrismaActivitiesRepo channel filter application", () => {
  const channelFilter: Filter[] = [
    {
      field: FilterFieldKey.connectedAccountId,
      operator: FilterOperatorKey.in,
      value: [A],
    },
  ];

  it("suppresses audit and applies the channel predicate to every channel-backed source (getCount)", async () => {
    await runWithTenant(messagesAndAudit(), () => messagingRepo().getCount({ filters: channelFilter }));

    expect(called("auditLog")).toBe(false);
    expect(channelClause(whereOf("messagingMessage", "count"))?.in).toEqual([A]);
    expect(channelClause(whereOf("accountActivity", "count"))?.in).toEqual([A]);
    expect(channelClause(whereOf("calendarEvent", "count"))?.in).toEqual([A]);
  });

  it("applies the identical channel predicate in getItems (item/count predicate parity)", async () => {
    await runWithTenant(messagesAndAudit(), () => messagingRepo().getItems({ filters: channelFilter }));

    expect(called("auditLog")).toBe(false);
    expect(channelClause(whereOf("messagingMessage", "findMany"))?.in).toEqual([A]);
    expect(channelClause(whereOf("accountActivity", "findMany"))?.in).toEqual([A]);
    expect(channelClause(whereOf("calendarEvent", "findMany"))?.in).toEqual([A]);
  });

  it("keeps audit in the feed when no provider or channel filter is active", async () => {
    await runWithTenant(messagesAndAudit(), () => messagingRepo().getCount({}));

    expect(called("auditLog")).toBe(true);
  });

  it("supports notIn to exclude a channel", async () => {
    await runWithTenant(messagesAndAudit(), () =>
      messagingRepo().getCount({
        filters: [
          {
            field: FilterFieldKey.connectedAccountId,
            operator: FilterOperatorKey.notIn,
            value: [A],
          },
        ],
      }),
    );

    expect(channelClause(whereOf("messagingMessage", "count"))?.notIn).toEqual([A]);
    expect(channelClause(whereOf("accountActivity", "count"))?.notIn).toEqual([A]);
  });

  it("uses the same hidden-message predicate for items and count", async () => {
    await runWithTenant(messagesAndAudit(), async () => {
      const repo = messagingRepo();
      await Promise.all([repo.getItems({}), repo.getCount({})]);
    });

    const itemAnd = whereOf("messagingMessage", "findMany").AND;
    const countAnd = whereOf("messagingMessage", "count").AND;
    expect(itemAnd).toContainEqual({ isHidden: false });
    expect(countAnd).toContainEqual({ isHidden: false });
  });

  it("applies selected folder visibility to messages and thread options", async () => {
    fake.folderStates.push({ id: A, selectedFolderIds: ["inbox"] });

    await runWithTenant(messagesAndAudit(), async () => {
      const repo = messagingRepo();
      await repo.getCount({});
      await repo.listThreadOptions({});
    });

    expect(whereOf("messagingMessage", "count").AND).toContainEqual({
      isHidden: false,
      OR: [
        { connectedAccountId: { notIn: [A] } },
        {
          connectedAccountId: A,
          OR: [{ folderIds: { isEmpty: true } }, { folderIds: { hasSome: ["inbox"] } }],
        },
      ],
    });
    expect(whereOf("messagingThread", "findMany").AND).toEqual(
      expect.arrayContaining([
        {
          OR: [{ lastMessageAt: { not: null } }, { messages: { some: { isDraft: true } } }],
        },
        expect.objectContaining({ OR: expect.any(Array) }),
      ]),
    );
    expect(whereOf("connectedAccount", "findMany").OR).toContainEqual({
      threads: { some: { sharedToCrm: true } },
    });
  });

  it("limits a positive thread filter to message rows", async () => {
    await runWithTenant(messagesAndAudit(), () =>
      messagingRepo().getCount({
        filters: [
          {
            field: FilterFieldKey.timelineThreadId,
            operator: FilterOperatorKey.in,
            value: [A],
          },
        ],
      }),
    );

    expect(called("auditLog")).toBe(false);
    expect(called("accountActivity")).toBe(false);
    expect(called("calendarEvent")).toBe(false);
    expect(whereOf("messagingMessage", "count").messagingThreadId.in).toEqual([A]);
  });
});

describe("PrismaActivitiesRepo provider consistency across channel-backed sources", () => {
  it("applies the provider filter to messages (direct), account-activity + calendar (relation), and suppresses audit", async () => {
    await runWithTenant(messagesAndAudit(), () =>
      messagingRepo().getCount({
        filters: [
          {
            field: FilterFieldKey.provider,
            operator: FilterOperatorKey.in,
            value: ["google"],
          },
        ],
      }),
    );

    expect(called("auditLog")).toBe(false);
    expect(whereOf("messagingMessage", "count").provider.in).toEqual(["google"]);
    expect(providerRelation(whereOf("accountActivity", "count"))).toEqual(["google"]);
    expect(providerRelation(whereOf("calendarEvent", "count"))).toEqual(["google"]);
  });
});

describe("PrismaActivitiesRepo source permissions", () => {
  it.each([
    {
      name: "audit only",
      permissions: [{ resource: Resource.auditLog, action: Action.readAll }],
      expected: {
        auditLog: true,
        messagingMessage: false,
        accountActivity: false,
        calendarEvent: false,
      },
    },
    {
      name: "messages only",
      permissions: [{ resource: Resource.inboxMessages, action: Action.readAll }],
      expected: {
        auditLog: false,
        messagingMessage: true,
        accountActivity: true,
        calendarEvent: true,
      },
    },
    {
      name: "both",
      permissions: [
        { resource: Resource.auditLog, action: Action.readAll },
        { resource: Resource.inboxMessages, action: Action.readAll },
      ],
      expected: {
        auditLog: true,
        messagingMessage: true,
        accountActivity: true,
        calendarEvent: true,
      },
    },
    {
      name: "neither",
      permissions: [],
      expected: {
        auditLog: false,
        messagingMessage: false,
        accountActivity: false,
        calendarEvent: false,
      },
    },
  ])("queries only permitted sources for $name", async ({ permissions, expected }) => {
    await runWithTenant(createMockUserWithPermissions(permissions), () => messagingRepo().getCount({}));

    expect({
      auditLog: called("auditLog"),
      messagingMessage: called("messagingMessage"),
      accountActivity: called("accountActivity"),
      calendarEvent: called("calendarEvent"),
    }).toEqual(expected);
  });
});
