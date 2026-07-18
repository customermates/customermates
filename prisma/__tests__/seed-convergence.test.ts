import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SEED_IDS } from "../seeds/context";
import { seedCustomFields, SYNTHETIC_CUSTOM_COLUMN_IDS } from "../seeds/custom-fields";
import { seedRelationships } from "../seeds/relationships";

function entities() {
  const organizations = Array.from({ length: 19 }, (_, index) => ({
    id: `organization-${index}`,
    website: `https://company-${index}.example`,
  }));
  const contacts = Array.from({ length: 30 }, (_, index) => ({ id: `contact-${index}` }));
  const deals = Array.from({ length: 10 }, (_, index) => ({ id: `deal-${index}` }));
  const services = Array.from({ length: 43 }, (_, index) => ({ id: `service-${index}` }));
  const tasks = Array.from({ length: 15 }, (_, index) => ({ id: `task-${index}` }));

  return {
    organizations,
    contacts,
    deals,
    services,
    tasks,
    contactDefinitions: contacts.map((_, index) => ["First", "Last", `person-${index}@example.com`, 0]),
    dealDefinitions: deals.map(() => ["Deal", 0, [], 0]),
    taskDefinitions: tasks.map(() => ["Task", [], [], [], [], 0]),
  } as never;
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

describe("synthetic seed convergence after UI edits", () => {
  it("reuses a recreated relationship by its natural key instead of colliding on the fixture id", async () => {
    const contactOrganization = relationDelegate();
    contactOrganization.upsert.mockImplementation(
      ({ where, create }: { where: Record<string, unknown>; create: Record<string, unknown> }) => {
        if ("id" in where) throw new Error("duplicate key value violates contactId_organizationId");
        return Promise.resolve({ ...create, id: "ui-recreated-relation" });
      },
    );
    const generic = relationDelegate();
    const prisma = {
      contactIdentifier: relationDelegate(),
      contactOrganization,
      contactUser: generic,
      organizationUser: generic,
      dealOrganization: generic,
      dealUser: generic,
      serviceDeal: generic,
      dealContact: generic,
      serviceUser: generic,
      taskUser: generic,
      taskContact: generic,
      taskOrganization: generic,
      taskDeal: generic,
      taskService: generic,
    } as unknown as PrismaClient;

    await expect(seedRelationships(context(prisma), entities())).resolves.toBeUndefined();

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
    const prisma = {
      customColumn: relationDelegate(),
      customFieldValue,
    } as unknown as PrismaClient;

    await seedCustomFields(context(prisma), entities());

    const reconciled = rows.filter(
      (row) => row.columnId === firstTarget.columnId && row.contactId === firstTarget.contactId,
    );
    expect(reconciled).toEqual([
      expect.objectContaining({
        id: "18000000-0000-4000-8000-000000000001",
        value: "+1 202-555-0100",
      }),
    ]);
  });
});
