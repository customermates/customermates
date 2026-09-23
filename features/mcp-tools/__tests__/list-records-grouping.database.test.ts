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
const { mcpToolResultText } = await import("../mcp-tool");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const ada = randomUUID();
const ben = randomUUID();
const status = randomUUID();
const [open, won] = [randomUUID(), randomUUID()];
const tenantUser = createMockUser({ companyId: company, id: ada });

type Grouped = {
  total: number;
  groupedBy: string;
  groups: { key: string; label: string; count: number; sums?: Record<string, number> }[];
  groupNote?: string;
  items: unknown[];
};

function structured(result: unknown): Grouped {
  return (result as { structuredContent: Grouped }).structuredContent;
}

function list(args: Record<string, unknown>) {
  return listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal", ...args }));
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("list_records groupBy against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      for (const [id, firstName] of [
        [ada, "Ada"],
        [ben, "Ben"],
      ] as const) {
        await prisma.user.create({
          data: { id, companyId: company, email: `${id}@example.com`, firstName, lastName: "Tester", status: "active" },
        });
      }
      await prisma.customColumn.create({
        data: {
          id: status,
          companyId: company,
          entityType: "deal",
          label: "Status",
          type: "singleSelect",
          options: {
            options: [
              { value: open, label: "Open", color: "secondary", index: 0, isDefault: true },
              { value: won, label: "Won", color: "secondary", index: 1, isDefault: false },
            ],
          },
        },
      });
      const deals = [
        ["Alpha", 1_000, [ada], open],
        ["Beta", 2_000, [ada], won],
        ["Gamma", 4_000, [ben], won],
        ["Delta", 8_000, [ada, ben], won],
      ] as const;
      for (const [name, value, owners, option] of deals) {
        const id = randomUUID();
        await prisma.deal.create({ data: { id, companyId: company, name, totalValue: value, totalQuantity: 1 } });
        for (const userId of owners) await prisma.dealUser.create({ data: { companyId: company, dealId: id, userId } });
        await prisma.customFieldValue.create({
          data: {
            companyId: company,
            entityType: "deal",
            columnId: status,
            type: "singleSelect",
            value: option,
            dealId: id,
          },
        });
      }
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({ where: { companyId: company } });
      await prisma.company.deleteMany({ where: { id: company } });
    });
    await prisma.$disconnect();
  });

  it("counts and totals the filtered deals per owner in one call, naming each owner", async () => {
    const result = await list({
      filters: [{ field: status, operator: "in", value: [won] }],
      groupBy: { field: "userIds" },
    });
    const grouped = structured(result);

    expect(grouped.total).toBe(3);
    expect(grouped.items).toEqual([]);
    expect(grouped.groupedBy).toBe("userIds");
    const byLabel = Object.fromEntries(
      grouped.groups.map((group) => [group.label, [group.count, group.sums?.totalValue]]),
    );
    expect(byLabel).toEqual({ "Ada Tester": [2, 10_000], "Ben Tester": [2, 12_000] });
    expect(grouped.groupNote).toMatch(/counts in each of them/);
  });

  it("groups by a single-select column with its option labels", async () => {
    const result = await list({ groupBy: { field: status } });
    const grouped = structured(result);
    const byLabel = Object.fromEntries(
      grouped.groups.map((group) => [group.label, [group.count, group.sums?.totalValue]]),
    );
    expect(byLabel).toEqual({ Open: [1, 1_000], Won: [3, 14_000] });
    expect(grouped.groupNote).toBeUndefined();
  });

  it("refuses a field it cannot group by and names the ones it can", async () => {
    const result = await list({ groupBy: { field: "name" } });
    expect(mcpToolResultText(result)).toMatch(/^deal records cannot be grouped by name\. Groupable fields: .*userIds/);
    expect(result).toMatchObject({ failure: { kind: "validation" } });
  });
});
