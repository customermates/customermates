import type { WorkbookRow } from "../workbook-writer";

import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

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

const { getCommitImportChunkInteractor, getDryRunImportChunkInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { buildExportColumns, buildSchemaSheetRows } = await import("../workbook-columns");
const { buildWorkbook } = await import("../workbook-writer");
const { readWorkbookFile } = await import("../import/read-workbook-file");
const { mappingFromSchemaSheet } = await import("../import/import-mapping");
const { buildPlan } = await import("../import/import-plan");
const { IMPORT_ENTITIES } = await import("../import/import-entity.registry");

const company = randomUUID();
const user = randomUUID();
const statusColumn = randomUUID();
const wonOption = randomUUID();
const lostOption = randomUUID();

const tenantUser = createMockUser({ companyId: company, id: user });

const customColumn = {
  id: statusColumn,
  label: "Pipeline",
  entityType: EntityType.contact,
  type: CustomColumnType.singleSelect,
  options: {
    options: [
      { value: wonOption, label: "Won", color: "success" as const, isDefault: false, index: 0 },
      { value: lostOption, label: "Lost", color: "destructive" as const, isDefault: false, index: 1 },
    ],
  },
};

async function exportedWorkbook(rows: WorkbookRow[]) {
  const columns = buildExportColumns(
    [
      { key: "firstName", header: "First Name" },
      { key: "lastName", header: "Last Name" },
      { key: statusColumn, header: "Pipeline" },
    ],
    [customColumn],
  );

  const built = await buildWorkbook({
    sheetName: "Contacts",
    columns,
    schemaRows: buildSchemaSheetRows(columns),
    relationSheetNames: [],
    pageSize: 100,
    rowLimit: 100,
    fetchPage: (skip) => Promise.resolve(skip === 0 ? { rows, relations: [], total: rows.length } : null),
  });

  return new File([new Uint8Array(built.buffer)], "contacts.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("spreadsheet round trip against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.user.create({
        data: {
          id: user,
          companyId: company,
          email: `transfer-${user}@example.com`,
          firstName: "Transfer",
          lastName: "Tester",
          status: "active",
        },
      });
      await prisma.customColumn.create({
        data: {
          id: statusColumn,
          label: "Pipeline",
          type: CustomColumnType.singleSelect,
          entityType: EntityType.contact,
          options: customColumn.options,
          companyId: company,
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.delete({ where: { id: company } });
    });
  });

  it("writes the option label back as the stored option id, through the real create path", async () => {
    const file = await exportedWorkbook([
      { __recordId: "", firstName: "Ada", lastName: "Lovelace", [statusColumn]: "Won" },
      { __recordId: "", firstName: "Grace", lastName: "Hopper", [statusColumn]: "Lost" },
    ]);

    const parsed = await readWorkbookFile(file);
    const mapping = mappingFromSchemaSheet(parsed.sources, parsed.schemaRows, IMPORT_ENTITIES[EntityType.contact], [
      customColumn,
    ]);

    expect(mapping).not.toBeNull();

    const plan = buildPlan({
      rows: parsed.rows,
      sources: parsed.sources,
      mapping: mapping ?? [],
      descriptor: IMPORT_ENTITIES[EntityType.contact],
      customColumns: [customColumn],
      relationIndex: {},
    });

    expect(plan.issues).toEqual([]);
    expect(plan.create).toHaveLength(2);
    expect(plan.update).toHaveLength(0);

    const chunk = {
      entityType: EntityType.contact,
      mode: "create" as const,
      rows: plan.create.map((row) => row.payload),
    };
    expect((await getDryRunImportChunkInteractor().invoke(chunk)).ok).toBe(true);
    const result = await getCommitImportChunkInteractor().invoke(chunk);

    expect(result.ok).toBe(true);

    const stored = await runWithoutTenant(() =>
      prisma.contact.findMany({
        where: { companyId: company },
        orderBy: { firstName: "asc" },
        select: { firstName: true, lastName: true, customFieldValues: { select: { columnId: true, value: true } } },
      }),
    );

    expect(stored.map((contact) => `${contact.firstName} ${contact.lastName}`)).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
    ]);
    expect(stored[0].customFieldValues).toEqual([{ columnId: statusColumn, value: wonOption }]);
    expect(stored[1].customFieldValues).toEqual([{ columnId: statusColumn, value: lostOption }]);
  });

  it("routes a row carrying a record id to update, so re-importing an export creates nothing new", async () => {
    const existing = await runWithoutTenant(() =>
      prisma.contact.findFirst({ where: { companyId: company, firstName: "Ada" }, select: { id: true } }),
    );

    const file = await exportedWorkbook([
      { __recordId: existing?.id ?? "", firstName: "Ada", lastName: "Lovelace", [statusColumn]: "Won" },
    ]);

    const parsed = await readWorkbookFile(file);
    const mapping = mappingFromSchemaSheet(parsed.sources, parsed.schemaRows, IMPORT_ENTITIES[EntityType.contact], [
      customColumn,
    ]);

    const plan = buildPlan({
      rows: parsed.rows,
      sources: parsed.sources,
      mapping: mapping ?? [],
      descriptor: IMPORT_ENTITIES[EntityType.contact],
      customColumns: [customColumn],
      relationIndex: {},
    });

    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].payload.id).toBe(existing?.id);
    const chunk = {
      entityType: EntityType.contact,
      mode: "update" as const,
      rows: plan.update.map((row) => row.payload),
    };
    expect((await getDryRunImportChunkInteractor().invoke(chunk)).ok).toBe(true);
    expect((await getCommitImportChunkInteractor().invoke(chunk)).ok).toBe(true);
    const count = await runWithoutTenant(() => prisma.contact.count({ where: { companyId: company } }));
    expect(count).toBe(2);
  });
});
