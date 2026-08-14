import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, EntityType, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const { calls, prisma } = vi.hoisted(() => {
  const calls: Record<string, unknown[]> = {
    contact: [],
    contactOrganization: [],
    dealContact: [],
    taskContact: [],
  };
  const model = (name: keyof typeof calls) => ({
    findMany: vi.fn((args: unknown) => {
      calls[name].push(args);
      return Promise.resolve([]);
    }),
  });

  return {
    calls,
    prisma: {
      contact: model("contact"),
      contactOrganization: model("contactOrganization"),
      dealContact: model("dealContact"),
      taskContact: model("taskContact"),
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma }));

import { PrismaContactRepo } from "../prisma-contact.repository";

const reader = createMockUserWithPermissions([
  { resource: Resource.contacts, action: Action.readOwn },
  { resource: Resource.organizations, action: Action.readOwn },
  { resource: Resource.deals, action: Action.readOwn },
  { resource: Resource.services, action: Action.readOwn },
  { resource: Resource.tasks, action: Action.readOwn },
]);

describe("activity contact scope readOwn access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(calls).forEach((entries) => entries.splice(0));
  });

  it("applies ownership predicates and a bounded take to every whole-type contact resolution", async () => {
    await runWithTenant(reader, async () => {
      const repo = new PrismaContactRepo();
      for (const entityType of Object.values(EntityType))
        await repo.resolveContactIdsForEntityTypeCompanyWide({ entityType, limit: 501 });
    });

    const contactCalls = calls.contact as Array<{ where: Record<string, any>; take?: number }>;
    const owner = JSON.stringify({ some: { userId: reader.id } });
    const wheres = contactCalls.map((call) => call.where);
    const dealSomes = wheres.filter((where) => where.deals).map((where) => where.deals.some);

    expect(contactCalls).toHaveLength(Object.values(EntityType).length);
    for (const call of contactCalls) expect(call.take).toBe(501);

    expect(wheres.some((where) => JSON.stringify(where.users) === owner)).toBe(true);
    expect(wheres.some((where) => JSON.stringify(where.organizations?.some?.organization?.users) === owner)).toBe(true);
    expect(dealSomes.some((some) => JSON.stringify(some.deal?.users) === owner)).toBe(true);
    expect(dealSomes.some((some) => JSON.stringify(some.deal?.services?.some?.service?.users) === owner)).toBe(true);
    expect(wheres.some((where) => JSON.stringify(where.tasks?.some?.task?.users) === owner)).toBe(true);

    expect(calls.contactOrganization).toHaveLength(0);
    expect(calls.dealContact).toHaveLength(0);
    expect(calls.taskContact).toHaveLength(0);
  });
});
