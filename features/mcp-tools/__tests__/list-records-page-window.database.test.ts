import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

await import("../tool-registry");
const { listRecordsTool } = await import("../entity-generic.mcp-tools");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const ada = randomUUID();
const tenantUser = createMockUser({ companyId: company, id: ada });
const names = Array.from({ length: 130 }, (_, index) => `Window-${String(index + 1).padStart(3, "0")}`);
const created = new Date("2026-08-01T08:00:00.000Z");

type Page = { total: number; page: number; pageSize: number; items: { id: string; name: string }[] };

function structured(result: unknown): Page {
  return (result as { structuredContent: Page }).structuredContent;
}

async function page(args: Record<string, unknown>) {
  return structured(await listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal", ...args })));
}

async function walk(pageSize: number, sortDescriptor?: { field: string; direction: "asc" | "desc" }) {
  const pages: Page[] = [];
  for (let number = 1; (number - 1) * pageSize < names.length; number += 1)
    pages.push(await page({ page: number, pageSize, ...(sortDescriptor ? { sortDescriptor } : {}) }));
  return pages;
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("list_records page sizes that are not offered, against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.user.create({
        data: {
          id: ada,
          companyId: company,
          email: `${ada}@example.com`,
          firstName: "Ada",
          lastName: "Tester",
          status: "active",
        },
      });
      await prisma.deal.createMany({
        data: names.toReversed().map((name) => ({
          id: randomUUID(),
          companyId: company,
          name,
          totalValue: 100,
          totalQuantity: 1,
          createdAt: created,
        })),
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({ where: { companyId: company } });
      await prisma.company.deleteMany({ where: { id: company } });
    });
    await prisma.$disconnect();
  });

  it.each([7, 50, 60])("walks every deal once, in name order, at pageSize %i", async (pageSize) => {
    const pages = await walk(pageSize, { field: "name", direction: "asc" });

    for (const [index, listed] of pages.entries()) {
      expect(listed).toMatchObject({ total: names.length, page: index + 1, pageSize });
      expect(listed.items.map((item) => item.name)).toEqual(names.slice(index * pageSize, (index + 1) * pageSize));
    }
  });

  it("joins adjacent offered pages without a gap or a repeat under the default order, where every deal ties on its date", async () => {
    const pages = await walk(60);
    const ids = pages.flatMap((listed) => listed.items.map((item) => item.id));

    expect(pages.map((listed) => listed.items.length)).toEqual([60, 60, 10]);
    expect(new Set(ids).size).toBe(names.length);
  });

  it("groups at a page size that is not offered, reporting the page and size asked for", async () => {
    const result = await listRecordsTool.execute(
      listRecordsTool.inputSchema.parse({ entity: "deal", page: 2, pageSize: 60, groupBy: { field: "createdAt" } }),
    );

    expect(result).not.toHaveProperty("failure");
    expect(structured(result)).toMatchObject({ total: names.length, page: 2, pageSize: 60, items: [] });
  });
});
