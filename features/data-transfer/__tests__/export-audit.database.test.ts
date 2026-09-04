import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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

    getActiveTenantUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    hasPermissionForUser() {
      return true;
    }

    hasPermission(resource: Resource, action: Action) {
      return Promise.resolve(
        (tenantUser.role?.permissions ?? []).some((p) => p.resource === resource && p.action === action),
      );
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

const { getExportContactsPageInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const actor = randomUUID();
const contact = randomUUID();

const exportRequest = {
  entityType: EntityType.contact,
  columns: [{ key: "firstName", header: "First Name" }],
  take: 500,
};

const tenantUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readAll }]);

tenantUser.companyId = company;
tenantUser.id = actor;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("an export leaves an audit trail in a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.user.create({
        data: {
          id: actor,
          companyId: company,
          email: `audit-${actor}@example.com`,
          firstName: "Audit",
          lastName: "Tester",
          status: "active",
        },
      });
      await prisma.contact.create({
        data: { id: contact, companyId: company, firstName: "Exported", lastName: "Record" },
      });
    });
  });

  beforeEach(async () => {
    await runWithoutTenant(() => prisma.auditLog.deleteMany({ where: { companyId: company } }));
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.delete({ where: { id: company } });
    });
  });

  it("writes exactly one row naming the actor, entity type and covered row count", async () => {
    const result = await getExportContactsPageInteractor().invoke({ ...exportRequest, skip: 0 });

    expect(result.ok).toBe(true);

    const rows = await runWithoutTenant(() => prisma.auditLog.findMany({ where: { companyId: company } }));

    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe("records.exported");
    expect(rows[0].userId).toBe(actor);
    expect(rows[0].entityId).toBe(company);
    expect(rows[0].eventData).toMatchObject({
      entityId: company,
      userId: actor,
      companyId: company,
      payload: {
        entityType: "contact",
        rowCount: 1,
        truncated: false,
        scope: "view",
      },
    });

    const serialized = JSON.stringify(rows[0].eventData);
    for (const leaked of ["filters", "searchTerm", "selectedIds", "sortDescriptor"])
      expect(serialized, `audit row must not carry ${leaked}`).not.toContain(leaked);
  });

  it("records one row for the whole export, not one per page", async () => {
    await getExportContactsPageInteractor().invoke({ ...exportRequest, skip: 0 });
    await getExportContactsPageInteractor().invoke({ ...exportRequest, skip: 500 });
    await getExportContactsPageInteractor().invoke({ ...exportRequest, skip: 1000 });

    const rows = await runWithoutTenant(() => prisma.auditLog.findMany({ where: { companyId: company } }));

    expect(rows).toHaveLength(1);
  });

  it("distinguishes an explicit selection from the current view", async () => {
    await getExportContactsPageInteractor().invoke({ ...exportRequest, skip: 0, selectedIds: [contact] });

    const rows = await runWithoutTenant(() => prisma.auditLog.findMany({ where: { companyId: company } }));

    expect(rows[0].eventData).toMatchObject({ payload: { scope: "selection" } });
  });
});
