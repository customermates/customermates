import type { RecordMutation } from "@/features/records/record-query.schema";
import type { RecordRef, RecordScalar } from "@/features/records/record-model.schema";

import ExcelJS from "exceljs";
import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { ExportRecordWorkbookInteractor } = await import(
  "@/features/data-transfer/export/export-record-workbook.interactor"
);
const { ExportRecordsInteractor } = await import("@/features/data-transfer/export/export-records.interactor");
const { EventService } = await import("@/features/event/event.service");
const { PrismaEventLogRepo } = await import("@/features/event/prisma-event-log.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

async function workspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const user = (roleId: string, firstName: string) =>
      prisma.user.create({
        data: {
          companyId: company.id,
          roleId,
          firstName,
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
    return {
      company,
      adminRole,
      memberRole,
      admin: await user(adminRole.id, "Admin"),
      member: await user(memberRole.id, "Member"),
    };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
  const member = createMockUser({ ...seed.member, role: { ...seed.memberRole, permissions: [] } });
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const events = new EventService([], new PrismaEventLogRepo({ dispatch: () => Promise.resolve() }));
  const exporter = new ExportRecordWorkbookInteractor(repo, policy, events);
  const jsonExporter = new ExportRecordsInteractor(repo, policy, events);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const id = (key: string) => presetId(seed.company.id, key);
  const run = <T>(fn: () => Promise<T>, as = admin) => runWithTenant(as, fn);
  const create = async (
    type: string,
    name: string,
    values: Array<[string, RecordScalar]> = [],
    links?: Extract<RecordMutation, { action: "create" }>["links"],
  ): Promise<RecordRef> => {
    const result = await run(() =>
      mutate.invoke({
        mutation: {
          action: "create",
          typeId: id(type),
          fields: [
            { fieldId: id(`${type}.name`), value: { kind: "text", value: name } },
            ...values.map(([key, value]) => ({ fieldId: id(key), value })),
          ],
          links,
        },
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const ref = result.data.refs.find((candidate) => candidate.typeId === id(type));
    if (!ref) throw new Error("Created record missing");
    return ref;
  };
  const exportWorkbook = async (typeId: string, as = admin) => {
    const result = await run(
      () => exporter.invoke({ typeId, filters: [], relationships: [], sort: [], format: "xlsx" }),
      as,
    );
    return result;
  };
  const exportJson = (typeId: string, as = admin) =>
    run(() => jsonExporter.invoke({ typeId, filters: [], relationships: [], sort: [] }), as);
  return { ...seed, admin, member, repo, id, run, create, exportWorkbook, exportJson };
}

async function sheets(workbook: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(workbook as unknown as ArrayBuffer);
  return new Map(
    book.worksheets.map((sheet) => {
      const rows: unknown[][] = [];
      sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      return [sheet.name, { headers: rows[0] as string[], rows: rows.slice(1) }] as const;
    }),
  );
}

describeDatabase("record workbook export", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  }, 120000);

  it("leaves out fields and relationships the caller cannot read and exports only readable records", async () => {
    const f = await workspace();
    const service = await f.create("service", "Private catalog", [
      ["service.amount", { kind: "decimal", value: "50", currency: "EUR" }],
    ]);
    const visible = await f.create("deal", "Assigned deal");
    await f.create("deal", "Other deal");
    for (const deal of [visible]) {
      await f.create(
        "lineItem",
        "Consulting line",
        [["lineItem.quantity", { kind: "decimal", value: "2", currency: null }]],
        [
          { relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal },
          { relationId: f.id("lineItem.service"), direction: "outgoing", record: service },
        ],
      );
    }
    await f.run(() =>
      runInTransaction(async () => {
        await f.repo.setAssignments(visible, [f.member.id]);
        await f.repo.setGrants(f.id("deal"), [{ roleId: f.memberRole.id, actions: ["readOwn"] }]);
      }),
    );

    const adminExport = await f.exportWorkbook(f.id("deal"));
    if (!adminExport.ok) throw new Error(JSON.stringify(adminExport.error));
    const adminSheets = await sheets(adminExport.data.workbook);
    expect([...adminSheets.keys()]).toEqual(["Deals", "Line items"]);
    const adminDeals = adminSheets.get("Deals");
    const adminLines = adminSheets.get("Line items");
    if (!adminDeals || !adminLines) throw new Error("Admin sheets missing");
    expect(adminDeals.headers.some((header) => header.startsWith("Value"))).toBe(true);
    expect(adminLines.headers.some((header) => header.startsWith("Amount"))).toBe(true);
    expect(adminLines.headers).toContain("Service");
    expect(adminLines.rows[0]).toContain("Private catalog");
    expect(adminDeals.rows.map((row) => row[0]).sort()).toEqual(["Assigned deal", "Other deal"]);
    const amount = adminLines.headers.findIndex((header) => header.startsWith("Amount"));
    expect(adminLines.rows[0][amount]).toBe(100);

    const memberExport = await f.exportWorkbook(f.id("deal"), f.member);
    if (!memberExport.ok) throw new Error(JSON.stringify(memberExport.error));
    expect(memberExport.data.rowCount).toBe(2);
    const memberSheets = await sheets(memberExport.data.workbook);
    const deals = memberSheets.get("Deals");
    const lines = memberSheets.get("Line items");
    if (!deals || !lines) throw new Error("Member sheets missing");
    expect(deals.rows.map((row) => row[0])).toEqual(["Assigned deal"]);
    expect(deals.headers).toContain("Name");
    expect(deals.headers.some((header) => header.startsWith("Value"))).toBe(false);
    expect(deals.headers.some((header) => header.startsWith("Weighted value"))).toBe(false);
    expect(lines.headers.some((header) => header.startsWith("Amount"))).toBe(false);
    expect(lines.headers.some((header) => header.startsWith("Unit price"))).toBe(false);
    expect(lines.headers).not.toContain("Service");
    expect(JSON.stringify([...memberSheets.values()])).not.toContain("Private catalog");
    expect(JSON.stringify([...memberSheets.values()])).not.toContain("Other deal");
  });

  it("records every Excel and JSON export as a records.exported event and none for a refused export", async () => {
    const f = await workspace();
    await f.create("deal", "First deal");
    await f.create("deal", "Second deal");
    expect(await f.exportWorkbook(f.id("deal"))).toMatchObject({ ok: true, data: { rowCount: 2 } });
    expect(await f.exportJson(f.id("deal"))).toMatchObject({ ok: true });
    expect(await f.exportJson(randomUUID())).toMatchObject({ ok: false });
    const events = await runWithoutTenant(() =>
      prisma.eventLog.findMany({
        where: { companyId: f.company.id, kind: "records.exported" },
        orderBy: { createdAt: "asc" },
      }),
    );
    const exported = {
      subjectKind: "records",
      subjectId: f.id("deal"),
      actorId: f.admin.id,
      payload: { typeId: f.id("deal"), rowCount: 2, truncated: false, scope: "view" },
    };
    expect(events).toMatchObject([exported, exported]);
  });

  it("never exports another workspace's records or lists", async () => {
    const first = await workspace();
    const second = await workspace();
    await first.create("deal", "First workspace deal");
    await second.create("deal", "Second workspace deal");

    const own = await first.exportWorkbook(first.id("deal"));
    if (!own.ok) throw new Error(JSON.stringify(own.error));
    const ownText = JSON.stringify([...(await sheets(own.data.workbook)).values()]);
    expect(ownText).toContain("First workspace deal");
    expect(ownText).not.toContain("Second workspace deal");

    const foreign = await second.exportWorkbook(first.id("deal"));
    expect(foreign.ok).toBe(false);
    expect(foreign).not.toHaveProperty("data");
  });
});
