import type { RecordExport } from "@/features/data-transfer/record-transfer.schema";

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
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));

await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { exportCrmRecordsTool, importCrmRecordsTool } = await import("../data-transfer.mcp-tools");
const { manageConnectedAccountsTool } = await import("../connected-account.mcp-tools");
const { manageTeamTool } = await import("../admin.mcp-tools");
const { executeMcpTool } = await import("../mcp-tool");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

type Seed = Awaited<ReturnType<typeof seedWorkspace>>;

async function seedWorkspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    await prisma.subscription.create({ data: { companyId: company.id, status: "active", plan: "enterprise" } });
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Parity",
        lastName: "Tester",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    const account = await prisma.connectedAccount.create({
      data: {
        companyId: company.id,
        userId: user.id,
        unipileAccountId: `w92-${randomUUID()}`,
        provider: "google",
        status: "ok",
        hasMessaging: true,
        emailAddress: "parity@example.test",
        displayName: "Parity mailbox",
        folders: [
          { id: "INBOX", name: "Inbox", role: "inbox", totalCount: 1, unreadCount: 0 },
          { id: "ARCHIVE", name: "Archive", role: null, totalCount: 1, unreadCount: 0 },
        ],
        selectedFolderIds: ["INBOX"],
      },
    });
    return { company, role, user, account };
  });
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo();
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30_000 }),
  );
  return { ...seed, admin, id: (key: string) => presetId(seed.company.id, key) };
}

function call<
  T extends { execute: (...args: never[]) => unknown; inputSchema: { parse: (value: unknown) => unknown } },
>(seed: Seed, tool: T, input: unknown) {
  return runWithTenant(seed.admin, () => executeMcpTool(tool as never, [tool.inputSchema.parse(input)]));
}

describeDatabase("MCP parity tools against a real database", { timeout: 120_000 }, () => {
  let seed: Seed;

  beforeAll(async () => {
    seed = await seedWorkspace();
  });

  afterAll(async () => {
    if (seed) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: seed.company.id } }));
    await prisma.$disconnect();
  });

  it("imports records through import_crm_records and exports them again through export_crm_records", async () => {
    const typeId = seed.id("contact");
    const empty = await call(seed, exportCrmRecordsTool, { typeId });
    expect(empty.ok).toBe(true);
    const base = (empty.ok ? empty.structuredContent : {}) as unknown as RecordExport;
    const model = await runWithTenant(seed.admin, () =>
      runInTransaction(() => createTestRecordRepo().getModel(), { readOnly: true }),
    );
    const inputFields = model.fields.filter(
      (field) =>
        field.typeId === typeId && !field.archived && field.behavior.kind === "input" && field.valueType !== "channels",
    );
    const nameField = inputFields.find((field) => field.valueType === "text")?.id;
    expect(nameField).toEqual(expect.any(String));
    const recordId = randomUUID();
    const now = new Date().toISOString();
    const document = {
      ...base,
      records: [
        {
          ref: { typeId, recordId },
          version: 1,
          schemaRevision: base.schemaRevision,
          createdAt: now,
          updatedAt: now,
          fields: inputFields.map((field) => ({
            fieldId: field.id,
            result:
              field.id === nameField
                ? { state: "value" as const, value: { kind: "text" as const, value: "Imported over MCP" } }
                : { state: "missing" as const },
          })),
          assignedUserIds: [],
        },
      ],
      links: [],
    };

    const imported = await call(seed, importCrmRecordsTool, {
      document,
      mode: "create",
      idempotencyKey: `w92-import-${recordId}`,
    });
    expect(imported).toMatchObject({ ok: true, structuredContent: { created: 1, updated: 0, linked: 0 } });

    const exported = await call(seed, exportCrmRecordsTool, { typeId });
    expect(exported.ok).toBe(true);
    const records = ((exported.ok ? exported.structuredContent?.records : []) ?? []) as RecordExport["records"];
    expect(records.map((record) => record.ref.recordId)).toContain(recordId);
    expect(exported.ok && exported.result).toContain("Imported over MCP");

    const replay = await call(seed, importCrmRecordsTool, {
      document,
      mode: "create",
      idempotencyKey: `w92-import-${recordId}`,
    });
    expect(replay).toMatchObject({ ok: true, structuredContent: { created: 1 } });
  });

  it("rejects an import from an older schema revision without writing", async () => {
    const typeId = seed.id("contact");
    const exported = await call(seed, exportCrmRecordsTool, { typeId });
    const base = (exported.ok ? exported.structuredContent : {}) as unknown as RecordExport;

    const result = await call(seed, importCrmRecordsTool, {
      document: { ...base, schemaRevision: base.schemaRevision + 1, records: [], links: [] },
      mode: "create",
      idempotencyKey: `w92-stale-${randomUUID()}`,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("conflict");
  });

  it("returns one stable invitation link through manage_team invite_link", async () => {
    const first = await call(seed, manageTeamTool, { action: "invite_link" });
    const second = await call(seed, manageTeamTool, { action: "invite_link" });

    expect(first.ok).toBe(true);
    const link = first.ok ? (first.structuredContent?.link as string) : "";
    expect(link).toMatch(/\/invitation\/[\w-]{32}$/);
    expect(second.ok && second.structuredContent?.link).toBe(link);
    const tokens = await runWithoutTenant(() => prisma.inviteToken.findMany({ where: { companyId: seed.company.id } }));
    expect(tokens).toHaveLength(1);
  });

  it("changes folders and sharing of an owned account through manage_connected_accounts", async () => {
    const listed = await call(seed, manageConnectedAccountsTool, { action: "list" });
    expect(listed.ok && listed.structuredContent?.items).toEqual([
      expect.objectContaining({ id: seed.account.id, selectedFolderIds: ["INBOX"], shared: false }),
    ]);

    const folders = await call(seed, manageConnectedAccountsTool, {
      action: "set_folders",
      id: seed.account.id,
      selectedFolderIds: ["INBOX", "ARCHIVE", "UNKNOWN"],
    });
    const sharing = await call(seed, manageConnectedAccountsTool, {
      action: "set_sharing",
      id: seed.account.id,
      shared: true,
    });

    expect(folders.ok && folders.structuredContent?.account).toMatchObject({
      selectedFolderIds: ["ARCHIVE", "INBOX"],
    });
    expect(sharing.ok && sharing.structuredContent?.account).toMatchObject({ shared: true });
    const stored = await runWithoutTenant(() =>
      prisma.connectedAccount.findUniqueOrThrow({ where: { id: seed.account.id } }),
    );
    expect(stored).toMatchObject({ shared: true, selectedFolderIds: ["ARCHIVE", "INBOX"] });
  });

  it("refuses settings changes on an account id the caller does not own", async () => {
    const result = await call(seed, manageConnectedAccountsTool, {
      action: "set_sharing",
      id: randomUUID(),
      shared: true,
    });

    expect(result.ok).toBe(false);
  });
});
