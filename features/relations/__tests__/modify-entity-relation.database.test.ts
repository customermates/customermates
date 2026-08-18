import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));
vi.mock("@/features/user/user.service", () => ({
  UserService: class {
    getUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    getActiveUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    hasPermission() {
      return Promise.resolve(true);
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

const { getModifyEntityRelationInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const companyA = randomUUID();
const companyB = randomUUID();
const userA = randomUUID();
const ada = randomUUID();
const orgOne = randomUUID();
const orgTwo = randomUUID();
const deal = randomUUID();
const serviceOne = randomUUID();
const serviceTwo = randomUUID();
const serviceThree = randomUUID();
const contactB = randomUUID();
const orgB = randomUUID();

const tenantUser = createMockUser({ companyId: companyA, id: userA });

const SNAPSHOT_TABLES = [
  "contact",
  "organization",
  "deal",
  "service",
  "task",
  "contactOrganization",
  "contactUser",
  "organizationUser",
  "dealContact",
  "dealOrganization",
  "dealUser",
  "serviceDeal",
  "serviceUser",
  "taskUser",
  "taskContact",
  "taskOrganization",
  "taskDeal",
  "taskService",
  "contactIdentifier",
  "customFieldValue",
] as const;

async function snapshot(companyId: string) {
  const counts: Record<string, number> = {};
  for (const table of SNAPSHOT_TABLES) {
    const model = prisma[table] as unknown as { count: (args: { where: { companyId: string } }) => Promise<number> };
    counts[table] = await runWithoutTenant(() => model.count({ where: { companyId } }));
  }
  const quantities = await runWithoutTenant(() =>
    prisma.serviceDeal.findMany({
      where: { companyId },
      orderBy: { serviceId: "asc" },
      select: { serviceId: true, quantity: true },
    }),
  );
  const names = await runWithoutTenant(() =>
    prisma.contact.findMany({
      where: { companyId },
      orderBy: { id: "asc" },
      select: { firstName: true, lastName: true },
    }),
  );
  return { counts, quantities, names };
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("record links against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyA } });
      await prisma.company.create({ data: { id: companyB } });
      await prisma.user.create({
        data: {
          id: userA,
          companyId: companyA,
          email: `links-${userA}@example.com`,
          firstName: "Link",
          lastName: "Tester",
          status: "active",
        },
      });
      await prisma.contact.create({
        data: { id: ada, companyId: companyA, firstName: "Ada", lastName: "Lovelace" },
      });
      await prisma.organization.create({ data: { id: orgOne, companyId: companyA, name: "ACME GmbH" } });
      await prisma.organization.create({ data: { id: orgTwo, companyId: companyA, name: "Globex" } });
      await prisma.contactOrganization.create({
        data: { companyId: companyA, contactId: ada, organizationId: orgOne },
      });
      await prisma.deal.create({ data: { id: deal, companyId: companyA, name: "Big Deal" } });
      await prisma.service.create({ data: { id: serviceOne, companyId: companyA, name: "Consulting", amount: 100 } });
      await prisma.service.create({ data: { id: serviceTwo, companyId: companyA, name: "Support", amount: 50 } });
      await prisma.service.create({ data: { id: serviceThree, companyId: companyA, name: "Training", amount: 75 } });
      await prisma.serviceDeal.create({
        data: { companyId: companyA, dealId: deal, serviceId: serviceOne, quantity: 5 },
      });
      await prisma.serviceDeal.create({
        data: { companyId: companyA, dealId: deal, serviceId: serviceTwo, quantity: 2 },
      });
      await prisma.task.create({ data: { companyId: companyA, name: "Follow up", type: "custom" } });

      await prisma.contact.create({
        data: { id: contactB, companyId: companyB, firstName: "Sentinel", lastName: "User" },
      });
      await prisma.organization.create({ data: { id: orgB, companyId: companyB, name: "Other Co" } });
      await prisma.contactOrganization.create({
        data: { companyId: companyB, contactId: contactB, organizationId: orgB },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
      await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
    });
    await prisma.$disconnect();
  });

  it("linking a contact to an organization changes exactly one join row and nothing else", async () => {
    const beforeA = await snapshot(companyA);
    const beforeB = await snapshot(companyB);

    const result = await getModifyEntityRelationInteractor().invoke({
      entity: "contact",
      sourceId: ada,
      relation: "organizations",
      mode: "add",
      ids: [orgTwo],
    });
    expect(result.ok).toBe(true);

    const afterA = await snapshot(companyA);
    expect(afterA.counts).toEqual({ ...beforeA.counts, contactOrganization: beforeA.counts.contactOrganization + 1 });
    expect(afterA.quantities).toEqual(beforeA.quantities);
    expect(afterA.names).toEqual(beforeA.names);
    expect(await snapshot(companyB)).toEqual(beforeB);
  });

  it("unlinking removes exactly that join row and returns to the baseline", async () => {
    const before = await snapshot(companyA);

    const result = await getModifyEntityRelationInteractor().invoke({
      entity: "contact",
      sourceId: ada,
      relation: "organizations",
      mode: "remove",
      ids: [orgTwo],
    });
    expect(result.ok).toBe(true);

    const after = await snapshot(companyA);
    expect(after.counts).toEqual({ ...before.counts, contactOrganization: before.counts.contactOrganization - 1 });
    expect(after.quantities).toEqual(before.quantities);
    expect(
      await runWithoutTenant(() =>
        prisma.contactOrganization.count({ where: { companyId: companyA, contactId: ada, organizationId: orgOne } }),
      ),
    ).toBe(1);
  });

  it("linking a service to a deal preserves existing quantities and defaults the new one to 1", async () => {
    const before = await snapshot(companyA);

    const result = await getModifyEntityRelationInteractor().invoke({
      entity: "deal",
      sourceId: deal,
      relation: "services",
      mode: "add",
      ids: [serviceThree],
    });
    expect(result.ok).toBe(true);

    const after = await snapshot(companyA);
    expect(after.counts).toEqual({ ...before.counts, serviceDeal: before.counts.serviceDeal + 1 });
    const byService = Object.fromEntries(after.quantities.map((row) => [row.serviceId, row.quantity]));
    expect(byService[serviceOne]).toBe(5);
    expect(byService[serviceTwo]).toBe(2);
    expect(byService[serviceThree]).toBe(1);
  });

  it("unlinking one service keeps the surviving quantities untouched", async () => {
    const before = await snapshot(companyA);

    const result = await getModifyEntityRelationInteractor().invoke({
      entity: "deal",
      sourceId: deal,
      relation: "services",
      mode: "remove",
      ids: [serviceTwo],
    });
    expect(result.ok).toBe(true);

    const after = await snapshot(companyA);
    expect(after.counts).toEqual({ ...before.counts, serviceDeal: before.counts.serviceDeal - 1 });
    const byService = Object.fromEntries(after.quantities.map((row) => [row.serviceId, row.quantity]));
    expect(byService[serviceOne]).toBe(5);
    expect(byService[serviceThree]).toBe(1);
  });

  it("removing an id that is not linked is a database-level no-op", async () => {
    const before = await snapshot(companyA);

    const result = await getModifyEntityRelationInteractor().invoke({
      entity: "contact",
      sourceId: ada,
      relation: "organizations",
      mode: "remove",
      ids: [orgTwo],
    });
    expect(result.ok).toBe(true);

    expect(await snapshot(companyA)).toEqual(before);
  });
});
