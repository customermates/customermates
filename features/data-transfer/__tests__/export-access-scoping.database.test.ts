import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
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

    hasPermission() {
      return Promise.resolve(true);
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
const owner = randomUUID();
const stranger = randomUUID();
const ownedContact = randomUUID();
const strangerContact = randomUUID();

const tenantUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readOwn }]);

tenantUser.companyId = company;
tenantUser.id = owner;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("export honours read scope against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      for (const [id, first] of [
        [owner, "Owner"],
        [stranger, "Stranger"],
      ] as const) {
        await prisma.user.create({
          data: {
            id,
            companyId: company,
            email: `scope-${id}@example.com`,
            firstName: first,
            lastName: "Tester",
            status: "active",
          },
        });
      }

      await prisma.contact.create({
        data: {
          id: ownedContact,
          companyId: company,
          firstName: "Mine",
          lastName: "Record",
          users: { create: [{ userId: owner, companyId: company }] },
        },
      });
      await prisma.contact.create({
        data: {
          id: strangerContact,
          companyId: company,
          firstName: "Theirs",
          lastName: "Record",
          users: { create: [{ userId: stranger, companyId: company }] },
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.delete({ where: { id: company } });
    });
  });

  it("returns only records the readOwn user owns when no selection is given", async () => {
    const result = await getExportContactsPageInteractor().invoke({
      entityType: EntityType.contact,
      columns: [{ key: "firstName", header: "First Name" }],
      skip: 0,
      take: 500,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.data.rows.map((row) => row.id);
    expect(ids).toContain(ownedContact);
    expect(ids).not.toContain(strangerContact);
  });

  it("does not let an explicit selection widen the readOwn scope", async () => {
    const result = await getExportContactsPageInteractor().invoke({
      entityType: EntityType.contact,
      columns: [{ key: "firstName", header: "First Name" }],
      skip: 0,
      take: 500,
      selectedIds: [ownedContact, strangerContact],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.data.rows.map((row) => row.id);
    expect(ids).toEqual([ownedContact]);
    expect(ids).not.toContain(strangerContact);
  });
});
