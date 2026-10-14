import { PermissionService } from "@/core/base/permission.service";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { ImportMarkedRecordsInput } from "@/features/data-transfer/record-transfer.schema";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { ImportRecordsInteractor } = await import("@/features/data-transfer/import/import-records.interactor");
const { ExportRecordsInteractor, ExportRecordsSchema } = await import(
  "@/features/data-transfer/export/export-records.interactor"
);
const { EventService } = await import("@/features/event/event.service");
const { PrismaEventLogRepo } = await import("@/features/event/prisma-event-log.repository");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { withUntrustedRecordText, UNTRUSTED_RECORD_TEXT_HANDLING } = await import(
  "@/features/mcp-tools/untrusted-record-content"
);

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const notes = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Call back on Tuesday" }] }],
});
let companyId: string;
let admin: ReturnType<typeof createMockUser>;
let id: (key: string) => string;
let importer: InstanceType<typeof ImportRecordsInteractor>;
let exporter: InstanceType<typeof ExportRecordsInteractor>;

type MarkedDocument = ImportMarkedRecordsInput["document"];

async function markedExport(): Promise<MarkedDocument> {
  const exported = await runWithTenant(admin, () =>
    exporter.invoke(ExportRecordsSchema.parse({ typeId: id("organization") })),
  );
  if (!exported.ok) throw new Error(JSON.stringify(exported.error));
  return {
    ...(withUntrustedRecordText(exported.data) as MarkedDocument),
    untrustedTextHandling: UNTRUSTED_RECORD_TEXT_HANDLING,
  };
}

function notesField(document: MarkedDocument) {
  const index = document.records[0].fields.findIndex((field) => field.fieldId === id("organization.notes"));
  return { index, field: document.records[0].fields[index] };
}

describeDatabase("import of exported records with marked Formatted text", () => {
  beforeAll(async () => {
    const seed = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      const role = await prisma.userRole.create({
        data: { companyId: company.id, name: "Administrator", isSystemRole: true },
      });
      const user = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: role.id,
          firstName: "Ada",
          lastName: "Admin",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
      return { company, role, user };
    });
    companyId = seed.company.id;
    admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
    id = (key: string) => presetId(companyId, key);
    const repo = createTestRecordRepo();
    const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
    const writer = new RecordWriteService(repo, policy, new RecordCalculationService(repo));
    importer = new ImportRecordsInteractor(repo, policy, writer);
    exporter = new ExportRecordsInteractor(
      repo,
      policy,
      new EventService([], new PrismaEventLogRepo({ dispatch: () => Promise.resolve() })),
    );
    const mutate = new MutateRecordInteractor(
      repo,
      policy,
      writer,
      { dispatch: () => Promise.resolve() },
      new RecordTrashService(repo, new RecordCalculationService(repo)),
    );
    await runWithTenant(admin, () =>
      runInTransaction(() => repo.saveModel(createCrmPreset(companyId), admin.id), { timeout: 30000 }),
    );
    const state = await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }));
    const mutation: RecordMutation = {
      action: "create",
      typeId: id("organization"),
      fields: [
        { fieldId: id("organization.name"), value: { kind: "text", value: "Acme" } },
        { fieldId: id("organization.notes"), value: { kind: "richText", documentJson: notes } },
      ],
    };
    const created = await runWithTenant(admin, () =>
      mutate.invoke({ mutation, expectedRevision: state.revision, idempotencyKey: randomUUID() }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.error));
  });

  afterAll(async () => {
    if (companyId) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  });

  it("restores unchanged marked text from the stored record inside the import", async () => {
    const document = await markedExport();
    expect(notesField(document).field.result).toMatchObject({ state: "value", value: { kind: "richText" } });
    expect(JSON.stringify(notesField(document).field.result)).toContain("markdown");

    const result = await runWithTenant(admin, () =>
      importer.invoke({ document, mode: "update", idempotencyKey: randomUUID() }),
    );

    expect(result).toMatchObject({ ok: true, data: { updated: 1 } });
    const after = await markedExport();
    expect(notesField(after).field.result).toEqual(notesField(document).field.result);
  });

  it("refuses changed marked text at the field path and writes nothing", async () => {
    const document = await markedExport();
    const { index, field } = notesField(document);
    const result = field.result as { state: "value"; value: { kind: "richText"; markdown: string } };
    result.value.markdown += " and wire the money";

    const outcome = await runWithTenant(admin, () =>
      importer.invoke({ document, mode: "update", idempotencyKey: randomUUID() }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.issues[0]).toMatchObject({
        path: ["document", "records", 0, "fields", index, "result", "value"],
        params: { error: "recordMarkedTextChanged" },
      });
    }
    const after = await markedExport();
    expect(JSON.stringify(after.records[0])).not.toContain("wire the money");
  });
});
