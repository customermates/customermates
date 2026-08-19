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

await import("@/core/di");
const { manageCustomColumnsTool } = await import("../custom-column.mcp-tools");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const user = randomUUID();
const tenantUser = createMockUser({ companyId: company, id: user });

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("manage_custom_columns against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.user.create({
        data: {
          id: user,
          companyId: company,
          email: `columns-${user}@example.com`,
          firstName: "Column",
          lastName: "Tester",
          status: "active",
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: company } }));
    await prisma.$disconnect();
  });

  it("creates a select field when the model sends option labels only", async () => {
    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      entityType: "deal",
      type: "singleSelect",
      label: "Install Stage",
      options: {
        options: [{ label: "Survey" }, { label: "Quoted" }, { label: "Scheduled" }, { label: "Installed" }],
      },
    } as never);

    const stored = await runWithoutTenant(() =>
      prisma.customColumn.findMany({ where: { companyId: company }, select: { label: true, options: true } }),
    );

    expect(String(result)).not.toMatch(/Validation error/i);
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe("Install Stage");
    const options = (stored[0].options as { options: { label: string; value: string }[] }).options;
    expect(options.map((option) => option.label)).toEqual(["Survey", "Quoted", "Scheduled", "Installed"]);
  });
});
