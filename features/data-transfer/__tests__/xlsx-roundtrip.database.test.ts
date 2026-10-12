import { PermissionService } from "@/core/base/permission.service";
import type { CalculatedValue, RecordField, RecordRef, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { ExportRecordsInput } from "@/features/data-transfer/export/export-records.interactor";
import type { XlsxWizardPorts } from "@/app/[locale]/(protected)/records/[typeId]/components/xlsx-import-wizard.store";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import englishMessages from "@/i18n/locales/en.json";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { plainTextDocument } from "@/features/data-transfer/import/xlsx/xlsx-values";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => {
  const translate = (key: string) =>
    key
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], englishMessages);
  return {
    getLocale: () => Promise.resolve("en"),
    getTranslations: () =>
      Promise.resolve(Object.assign((key: string) => String(translate(key) ?? key), { raw: translate })),
  };
});

type WorkbookExporter = new (...dependencies: unknown[]) => {
  invoke: (input: ExportRecordsInput) => Promise<{ ok: true; data: { workbook: Buffer } } | { ok: false }>;
};

const exporterModule = (await import(
  new URL("../export/export-record-workbook.interactor.ts", import.meta.url).pathname
).catch(() => null)) as { ExportRecordWorkbookInteractor: WorkbookExporter } | null;

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { QueryRecordsInteractor } = await import("@/features/records/query-records.interactor");
const { GetRecordInteractor } = await import("@/features/records/get-record.interactor");
const { GetRecordChoicesInteractor } = await import("@/features/records/get-record-choices.interactor");
const { ImportRecordsInteractor } = await import("@/features/data-transfer/import/import-records.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { XlsxImportWizardStore } = await import(
  "@/app/[locale]/(protected)/records/[typeId]/components/xlsx-import-wizard.store"
);

const describeRoundTrip = getLocalDatabaseTestUrl() && exporterModule ? describe : describe.skip;
const companies: string[] = [];
const text = (value: string): RecordScalar => ({ kind: "text", value });

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

function comparable(result: CalculatedValue | undefined) {
  if (result?.state !== "value") return result;
  const value = result.value;
  if (value.kind === "dateTime") return { kind: value.kind, value: new Date(value.value).toISOString() };
  if (value.kind === "richText") return { kind: value.kind, document: JSON.parse(value.documentJson) as unknown };
  return value;
}

describeRoundTrip("XLSX export and import round trip", () => {
  it("restores every exported value of a record when its own Excel export is imported", async () => {
    const seed = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      companies.push(company.id);
      const role = await prisma.userRole.create({
        data: { companyId: company.id, name: "Administrator", isSystemRole: true },
      });
      const [owner, other] = await Promise.all(
        ["Ada", "Max"].map((firstName) =>
          prisma.user.create({
            data: {
              companyId: company.id,
              roleId: role.id,
              firstName,
              lastName: "Roundtrip",
              email: `${randomUUID()}@example.test`,
              status: "active",
            },
          }),
        ),
      );
      return { company, role, owner, other };
    });
    const admin = createMockUser({ ...seed.owner, role: { ...seed.role, permissions: [] } });
    const repo = new PrismaRecordRepo();
    const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
    const writer = new RecordWriteService(repo, policy, new RecordCalculationService(repo));
    const mutate = new MutateRecordInteractor(repo, policy, writer, { dispatch: () => Promise.resolve() });
    const query = new QueryRecordsInteractor(repo, policy);
    const read = new GetRecordInteractor(repo, policy);
    const choices = new GetRecordChoicesInteractor(repo, policy, query);
    const importer = new ImportRecordsInteractor(repo, policy, writer);
    const id = (key: string) => presetId(seed.company.id, key);
    const deal = id("deal");
    const preset = createCrmPreset(seed.company.id);
    const extra = (
      key: string,
      label: string,
      valueType: RecordField["valueType"],
      options: Partial<RecordField> = {},
    ) => {
      const field: RecordField = {
        id: id(`deal.${key}`),
        typeId: deal,
        label,
        valueType,
        behavior: { kind: "input" },
        required: false,
        archived: false,
        publishedSummary: false,
        options: [],
        position: 50 + preset.fields.length,
        ...options,
      };
      preset.fields.push(field);
      return field.id;
    };
    const fieldIds = {
      close: extra("close", "Close date", "date"),
      kickoff: extra("kickoff", "Kickoff", "dateTime"),
      period: extra("period", "Period", "dateRange"),
      signed: extra("signed", "Signed", "boolean"),
      billing: extra("billing", "Billing email", "email"),
      site: extra("site", "Website", "url"),
      tags: extra("tags", "Tags", "select", {
        multiple: true,
        options: [
          { id: "alpha", label: "Alpha", color: null, attributes: [] },
          { id: "beta", label: "Beta", color: null, attributes: [] },
        ],
      }),
      owner: extra("owner", "Owner", "member"),
      score: extra("score", "Score", "number"),
      code: extra("code", "Code", "text"),
    };
    await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(preset, admin.id), { timeout: 30000 }));
    const mutation = async (value: RecordMutation) => {
      const state = await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      );
      const result = await runWithTenant(admin, () =>
        mutate.invoke({ mutation: value, expectedRevision: state.revision, idempotencyKey: randomUUID() }),
      );
      if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
      return result.data.refs;
    };
    const created = async (value: Extract<RecordMutation, { action: "create" }>): Promise<RecordRef> => {
      const ref = (await mutation(value)).find((candidate) => candidate.typeId === value.typeId);
      if (!ref) throw new Error("No reference");
      return ref;
    };
    const record = (ref: RecordRef) =>
      runWithTenant(admin, async () => {
        const result = await read.invoke(ref);
        if (!result.ok) throw new Error("Record could not be read");
        return result.data;
      });

    const acme = await created({
      action: "create",
      typeId: id("organization"),
      fields: [{ fieldId: id("organization.name"), value: text("Acme, Inc.") }],
    });
    const original = await created({
      action: "create",
      typeId: deal,
      assignedUserIds: [seed.owner.id],
      links: [{ relationId: id("deal.organizations"), direction: "outgoing", record: acme }],
      fields: [
        { fieldId: id("deal.name"), value: text("Atlas renewal") },
        { fieldId: id("deal.stage"), value: { kind: "select", value: id("deal.stage.proposal") } },
        {
          fieldId: id("deal.notes"),
          value: { kind: "richText", documentJson: plainTextDocument("Line one\nLine two") },
        },
        { fieldId: fieldIds.close, value: { kind: "date", value: "2026-11-30" } },
        { fieldId: fieldIds.kickoff, value: { kind: "dateTime", value: "2026-10-12T09:30:00.000Z" } },
        { fieldId: fieldIds.period, value: { kind: "range", start: "2026-01-01", end: "2026-03-31" } },
        { fieldId: fieldIds.signed, value: { kind: "boolean", value: true } },
        { fieldId: fieldIds.billing, value: text("billing@example.test") },
        { fieldId: fieldIds.site, value: text("https://example.test/acme") },
        { fieldId: fieldIds.tags, value: { kind: "selectList", value: ["alpha", "beta"] } },
        { fieldId: fieldIds.owner, value: { kind: "member", value: seed.other.id } },
        { fieldId: fieldIds.score, value: { kind: "decimal", value: "12.5", currency: null } },
        { fieldId: fieldIds.code, value: text("=1+1") },
      ],
    });
    const before = await record(original);

    const Exporter = exporterModule?.ExportRecordWorkbookInteractor;
    if (!Exporter) throw new Error("The workbook exporter is missing");
    const exported = await runWithTenant(admin, () =>
      new Exporter(repo, policy).invoke({
        typeId: deal,
        filters: [],
        relationships: [],
        sort: [],
      }),
    );
    if (!exported.ok) throw new Error("Workbook export failed");

    await mutation({
      action: "update",
      ref: original,
      expectedVersion: before.version,
      assignedUserIds: [seed.other.id],
      fields: [
        { fieldId: id("deal.stage"), value: { kind: "select", value: id("deal.stage.lost") } },
        { fieldId: fieldIds.close, value: { kind: "date", value: "2027-01-01" } },
        { fieldId: fieldIds.kickoff, value: { kind: "dateTime", value: "2027-01-01T00:00:00.000Z" } },
        { fieldId: fieldIds.period, value: { kind: "range", start: "2027-01-01", end: "2027-02-01" } },
        { fieldId: fieldIds.signed, value: { kind: "boolean", value: false } },
        { fieldId: fieldIds.billing, value: text("changed@example.test") },
        { fieldId: fieldIds.site, value: text("https://example.test/changed") },
        { fieldId: fieldIds.tags, value: { kind: "selectList", value: ["beta"] } },
        { fieldId: fieldIds.owner, value: { kind: "member", value: seed.owner.id } },
        { fieldId: fieldIds.score, value: { kind: "decimal", value: "1", currency: null } },
        { fieldId: fieldIds.code, value: text("changed") },
        { fieldId: id("deal.notes"), value: { kind: "richText", documentJson: plainTextDocument("Changed") } },
      ],
    });

    const stored = await runWithTenant(admin, () => runInTransaction(() => repo.getModel()));
    const model = { ...stored, types: stored.types.filter((type) => type.id === deal) };
    const ports: XlsxWizardPorts = {
      queryRecords: async (input) => {
        const result = await runWithTenant(admin, () => query.invoke(input));
        return result.ok ? { ok: true, data: result.data } : { ok: false };
      },
      listChoices: async (typeId, page, pageSize) => {
        const result = await runWithTenant(admin, () => choices.invoke({ typeId, page, pageSize }));
        return result.ok
          ? { ok: true, data: { records: result.data.records, total: result.data.total } }
          : { ok: false };
      },
      listMembers: () =>
        Promise.resolve({
          members: [seed.owner, seed.other].map((user) => ({
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
          })),
          totalPages: 1,
        }),
      importRecords: async (input) => {
        const result = await runWithTenant(admin, () => importer.invoke(input));
        return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message, fatal: false };
      },
    };
    const store = new XlsxImportWizardStore(
      model,
      deal,
      {
        recordId: englishMessages.DataTransfer.xlsxImport.recordId,
        assignedTo: englishMessages.RecordModel.assignedTo,
        rangeStart: englishMessages.RecordModel.rangeStart,
        rangeEnd: englishMessages.RecordModel.rangeEnd,
      },
      ports,
    );
    const workbook = exported.data.workbook;
    await store.load(
      "deals.xlsx",
      Promise.resolve(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength)),
    );
    await store.advance(String);
    expect(store.duplicates).toEqual([]);
    expect(store.mapping).toEqual(
      expect.arrayContaining([
        `field:${fieldIds.period}:start`,
        `field:${fieldIds.period}:end`,
        "recordId",
        "assignedTo",
        `relationship:${id("deal.organizations")}`,
      ]),
    );
    await store.advance(String);
    expect(store.previewRows.flatMap((row) => row.issues)).toEqual([]);
    await store.advance(String);
    store.setMode("update");
    expect(store.matchKey).toBe("recordId");
    await store.advance((issue) => `${issue.code}:${issue.value ?? ""}`);
    expect(store.summary).toEqual({ created: 0, updated: 1, skipped: 0, failed: [] });

    const after = await record(original);
    for (const field of before.fields) {
      expect(
        comparable(after.fields.find((candidate) => candidate.fieldId === field.fieldId)?.result),
        field.fieldId,
      ).toEqual(comparable(field.result));
    }
    expect(after.assignedUserIds).toEqual(before.assignedUserIds);
    const links = await runWithoutTenant(() =>
      prisma.recordLink.findMany({
        where: { companyId: seed.company.id, relationId: id("deal.organizations"), sourceId: original.recordId },
        select: { targetId: true },
      }),
    );
    expect(links).toEqual([{ targetId: acme.recordId }]);
  }, 120_000);
});
