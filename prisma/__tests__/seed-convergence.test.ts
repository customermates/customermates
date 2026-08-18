import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { seedContacts } from "../seeds/contacts";
import { SEED_IDS } from "../seeds/context";
import { seedCustomFields, SYNTHETIC_CUSTOM_COLUMN_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import { seedDeals } from "../seeds/deals";
import { relationshipTargets } from "../seeds/helpers";
import { seedOrganizations } from "../seeds/organizations";
import { seedRelationships } from "../seeds/relationships";
import { seedServices } from "../seeds/services";
import {
  seedTasks,
  SYNTHETIC_TASK_CONTACT_LINKS,
  SYNTHETIC_TASK_DEAL_LINKS,
  SYNTHETIC_TASK_ORGANIZATION_LINKS,
  SYNTHETIC_TASK_SERVICE_LINKS,
} from "../seeds/tasks";
import { seedWidgets } from "../seeds/widgets";

function entities() {
  const organizations = Array.from({ length: 19 }, (_, index) => ({
    id: `organization-${index}`,
    website: `https://company-${index}.example`,
  }));
  const contacts = Array.from({ length: 30 }, (_, index) => ({ id: `contact-${index}` }));
  const deals = Array.from({ length: 10 }, (_, index) => ({ id: `deal-${index}` }));
  const services = Array.from({ length: 43 }, (_, index) => ({ id: `service-${index}`, amount: index + 1 }));
  const tasks = Array.from({ length: 15 }, (_, index) => ({ id: `task-${index}` }));

  return {
    organizations,
    contacts,
    deals,
    services,
    tasks,
    contactDefinitions: contacts.map((_, index) => ["First", "Last", `person-${index}@example.com`, 0]),
    dealDefinitions: deals.map(() => ["Deal", 0, [], 0]),
    taskDefinitions: tasks.map((_, index) => [
      "Task",
      relationshipTargets(SYNTHETIC_TASK_CONTACT_LINKS, index),
      relationshipTargets(SYNTHETIC_TASK_ORGANIZATION_LINKS, index),
      relationshipTargets(SYNTHETIC_TASK_DEAL_LINKS, index),
      relationshipTargets(SYNTHETIC_TASK_SERVICE_LINKS, index),
      0,
    ]),
  };
}

function context(prisma: PrismaClient) {
  return {
    prisma,
    ids: SEED_IDS,
    seedUserEmail: "max.bergmann@customermates.com",
    sharedUserPassword: "local-demo-password",
  };
}

function relationDelegate() {
  return {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn(
      ({
        create,
      }: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => Promise.resolve(create),
    ),
  };
}

function relationshipPrisma() {
  const delegates = {
    contactIdentifier: relationDelegate(),
    contactOrganization: relationDelegate(),
    contactUser: relationDelegate(),
    organizationUser: relationDelegate(),
    dealOrganization: relationDelegate(),
    dealUser: relationDelegate(),
    serviceDeal: relationDelegate(),
    dealContact: relationDelegate(),
    serviceUser: relationDelegate(),
    taskUser: relationDelegate(),
    taskContact: relationDelegate(),
    taskOrganization: relationDelegate(),
    taskDeal: relationDelegate(),
    taskService: relationDelegate(),
  };

  return { delegates, prisma: delegates as unknown as PrismaClient };
}

type DeleteManyInput = {
  where: {
    companyId: string;
    id: {
      notIn?: string[];
      startsWith?: string;
    };
  };
};

function deleteManyInputs(delegate: ReturnType<typeof relationDelegate>): DeleteManyInput[] {
  return delegate.deleteMany.mock.calls.map(([input]) => input as DeleteManyInput);
}

function expectStalePrune(delegate: ReturnType<typeof relationDelegate>, prefix: string, expectedCount: number): void {
  const input = deleteManyInputs(delegate).find(({ where }) => where.id.startsWith === prefix);
  expect(input).toBeDefined();
  expect(input?.where.companyId).toBe(SEED_IDS.company);
  expect(input?.where.id.notIn).toHaveLength(expectedCount);
  expect(input?.where.id.notIn?.every((id) => id.startsWith(prefix))).toBe(true);
}

describe("synthetic seed convergence after UI edits", () => {
  it("reuses a recreated relationship by its natural key instead of colliding on the fixture id", async () => {
    const { delegates, prisma } = relationshipPrisma();
    const { contactOrganization } = delegates;
    contactOrganization.upsert.mockImplementation(
      ({ where, create }: { where: Record<string, unknown>; create: Record<string, unknown> }) => {
        if ("id" in where) throw new Error("duplicate key value violates contactId_organizationId");
        return Promise.resolve({ ...create, id: "ui-recreated-relation" });
      },
    );
    await expect(seedRelationships(context(prisma), entities() as never)).resolves.toBeUndefined();

    expect(deleteManyInputs(contactOrganization)).toEqual([
      {
        where: {
          companyId: SEED_IDS.company,
          id: { startsWith: "c0000000-" },
        },
      },
    ]);
    expect(contactOrganization.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      contactOrganization.upsert.mock.invocationCallOrder[0],
    );

    expect(contactOrganization.upsert).toHaveBeenCalledWith({
      where: {
        contactId_organizationId: {
          contactId: "contact-0",
          organizationId: "organization-0",
        },
      },
      update: {
        companyId: SEED_IDS.company,
        contactId: "contact-0",
        organizationId: "organization-0",
      },
      create: expect.objectContaining({
        id: "c0000000-0000-4000-8000-000000000001",
      }),
    });
  });

  it("rebuilds every reserved relationship namespace before natural-key upserts", async () => {
    const { delegates, prisma } = relationshipPrisma();

    await seedRelationships(context(prisma), entities() as never);

    const contracts = [
      ["contactIdentifier", "b0000000-"],
      ["contactOrganization", "c0000000-"],
      ["contactUser", "d0000000-"],
      ["organizationUser", "e0000000-"],
      ["dealOrganization", "f0000000-"],
      ["dealUser", "11000000-"],
      ["serviceDeal", "12000000-"],
      ["dealContact", "19000000-"],
      ["serviceUser", "13000000-"],
      ["taskUser", "14000000-"],
      ["taskContact", "1a000000-"],
      ["taskOrganization", "1b000000-"],
      ["taskDeal", "1c000000-"],
      ["taskService", "1d000000-"],
    ] as const;

    for (const [name, prefix] of contracts) {
      const delegate = delegates[name];
      expect(deleteManyInputs(delegate), `${name} must clear only its reserved namespace`).toEqual([
        { where: { companyId: SEED_IDS.company, id: { startsWith: prefix } } },
      ]);
      if (delegate.upsert.mock.calls.length > 0) {
        expect(delegate.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
          delegate.upsert.mock.invocationCallOrder[0],
        );
      }
    }
  });

  it("prunes stale deterministic top-level fixtures without selecting unrelated IDs", async () => {
    const fixtureData = entities();
    const organization = relationDelegate();
    const contact = relationDelegate();
    const service = relationDelegate();
    const deal = relationDelegate();
    const task = relationDelegate();
    const widget = relationDelegate();

    await seedOrganizations(context({ organization } as unknown as PrismaClient));
    await seedContacts(context({ contact } as unknown as PrismaClient), fixtureData.organizations as never);
    await seedServices(context({ service } as unknown as PrismaClient));
    await seedDeals(context({ deal } as unknown as PrismaClient), { services: fixtureData.services } as never);
    await seedTasks(context({ task } as unknown as PrismaClient));
    await seedWidgets(context({ widget } as unknown as PrismaClient), {
      customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
      customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
    });

    expectStalePrune(organization, "70000000-", 19);
    expectStalePrune(contact, "60000000-", 30);
    expectStalePrune(service, "90000000-", 43);
    expectStalePrune(deal, "80000000-", 10);
    expectStalePrune(task, "a0000000-", 15);
    expectStalePrune(widget, "15000000-", 8);
  });

  it("removes a recreated duplicate custom-field row before restoring the canonical fixture", async () => {
    const firstTarget = {
      companyId: SEED_IDS.company,
      columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.contactPhone,
      contactId: "contact-0",
    };
    const rows: Array<Record<string, unknown>> = [
      { id: "18000000-0000-4000-8000-000000000001", ...firstTarget, value: "edited" },
      { id: "ui-recreated-value", ...firstTarget, value: "duplicate" },
    ];
    const customFieldValue = {
      deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        if (where.columnId === firstTarget.columnId && where.contactId === firstTarget.contactId) {
          const keepId = (where.id as { not?: string } | undefined)?.not;
          rows.splice(0, rows.length, ...rows.filter(({ id }) => id === keepId));
        }
        return Promise.resolve({ count: 0 });
      }),
      upsert: vi.fn(({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = rows.find(({ id }) => id === create.id);
        if (existing) Object.assign(existing, update);
        else rows.push(create);
        return Promise.resolve(existing ?? create);
      }),
    };
    const customColumn = relationDelegate();
    const prisma = {
      company: { update: vi.fn().mockResolvedValue({}) },
      customColumn,
      customFieldValue,
    } as unknown as PrismaClient;

    await seedCustomFields(context(prisma), entities() as never);

    const reconciled = rows.filter(
      (row) => row.columnId === firstTarget.columnId && row.contactId === firstTarget.contactId,
    );
    expect(reconciled).toEqual([
      expect.objectContaining({
        id: "18000000-0000-4000-8000-000000000001",
        value: "+12025550100",
      }),
    ]);
    expectStalePrune(customColumn, "16000000-", Object.values(SYNTHETIC_CUSTOM_COLUMN_IDS).length);
  });
});
