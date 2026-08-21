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
const { mcpToolResultText } = await import("../mcp-tool");
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

  it("creates a select field when a model duplicates the same preferred and legacy option list", async () => {
    const selectOptions = [{ label: "Survey" }, { label: "Quoted" }, { label: "Scheduled" }, { label: "Installed" }];
    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "create",
      id: null,
      entityType: "deal",
      type: "singleSelect",
      label: "Install Stage",
      selectOptions,
      options: { options: selectOptions },
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

  it("does not let an agent update repurpose an existing field", async () => {
    await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "create",
      entityType: "organization",
      type: "plain",
      label: "Type",
    } as never);
    const existing = await runWithoutTenant(() =>
      prisma.customColumn.findFirstOrThrow({
        where: { companyId: company, entityType: "organization", label: "Type" },
      }),
    );

    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "update",
      id: existing.id,
      entityType: "organization",
      type: "plain",
      label: "AI maturity",
    } as never);

    expect(mcpToolResultText(result)).toContain('Refusing to rename the existing custom column "Type"');
    await expect(
      runWithoutTenant(() =>
        prisma.customColumn.findMany({
          where: { companyId: company, entityType: "organization" },
          select: { label: true },
        }),
      ),
    ).resolves.toEqual([{ label: "Type" }]);
  });

  it("does not let a field id redirect an update to another entity type", async () => {
    await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "create",
      entityType: "organization",
      type: "singleSelect",
      label: "Status",
      options: { options: [{ label: "Original" }] },
    } as never);
    const existing = await runWithoutTenant(() =>
      prisma.customColumn.findFirstOrThrow({
        where: { companyId: company, entityType: "organization", label: "Status" },
      }),
    );

    const result = await manageCustomColumnsTool.execute({
      action: "upsert",
      intent: "update",
      id: existing.id,
      entityType: "contact",
      type: "singleSelect",
      label: "Status",
      options: { options: [{ label: "Replacement" }] },
    } as never);

    expect(mcpToolResultText(result)).toContain("Refusing to update a custom column on organization as contact");
    const stored = await runWithoutTenant(() =>
      prisma.customColumn.findUniqueOrThrow({
        where: { id: existing.id },
        select: { entityType: true, options: true },
      }),
    );
    expect(stored.entityType).toBe("organization");
    expect((stored.options as { options: Array<{ label: string }> }).options.map((option) => option.label)).toEqual([
      "Original",
    ]);
  });
});
