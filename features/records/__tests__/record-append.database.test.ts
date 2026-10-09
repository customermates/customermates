import type { RecordMutation } from "../record-query.schema";

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
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { QueryRecordsInteractor } = await import("../query-records.interactor");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordConfigurationWriter } = await import("../record-configuration-writer");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { serializeJSONToMarkdown } = await import("@/components/editor/editor.utils");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const calculations = new RecordCalculationService(repo);
  const background = { dispatch: () => Promise.resolve() };
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, calculations),
    background,
  );
  const query = new QueryRecordsInteractor(repo, policy);
  const configure = new ApplyRecordConfigurationInteractor(
    repo,
    policy,
    new RecordConfigurationService(repo),
    new RecordConfigurationWriter(repo, calculations),
    background,
  );
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const mutation = async (value: RecordMutation) =>
    run(async () =>
      mutate.invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
  const createDeal = async (name: string) => {
    const result = await mutation({
      action: "create",
      typeId: id("deal"),
      fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: name } }],
    });
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return { typeId: id("deal"), recordId: result.data.refs[0].recordId };
  };
  const record = (ref: { typeId: string; recordId: string }) => run(() => repo.getRecordCompanyWide(ref));
  const stored = async (ref: { typeId: string; recordId: string }, fieldId: string) =>
    (await record(ref))?.values.find((value) => value.fieldId === fieldId);
  return { id, run, mutation, createDeal, record, stored, query, configure, revision };
}

describeDatabase("record field append", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("appends Formatted text from concurrent stale updates without losing either addition", async () => {
    const f = await fixture();
    const ref = await f.createDeal("Append target");
    const first = await f.mutation({
      action: "update",
      ref,
      expectedVersion: 1,
      fields: [{ fieldId: f.id("deal.notes"), value: null }],
    });
    expect(first.ok).toBe(true);
    const version = (await f.record(ref))?.version ?? 0;
    const results = await Promise.all(
      ["Called the buyer.", "Sent the revised quote."].map((append) =>
        f.mutation({ action: "update", ref, expectedVersion: 1, fields: [{ fieldId: f.id("deal.notes"), append }] }),
      ),
    );
    expect(
      results.map((result) => result.ok),
      JSON.stringify(results),
    ).toEqual([true, true]);
    const markdown = serializeJSONToMarkdown((await f.stored(ref, f.id("deal.notes")))?.jsonValue as object);
    expect(markdown).toContain("Called the buyer.");
    expect(markdown).toContain("Sent the revised quote.");
    expect(markdown.split("\n\n")).toHaveLength(2);
    expect((await f.record(ref))?.version).toBe(version + 2);
  });

  it("appends after existing Formatted text and plain Text with a blank line", async () => {
    const f = await fixture();
    const ref = await f.createDeal("Nova");
    expect(
      await f.mutation({
        action: "update",
        ref,
        expectedVersion: 1,
        fields: [
          { fieldId: f.id("deal.notes"), append: "## Context\n\nPilot budget approved." },
          { fieldId: f.id("deal.name"), append: "Expansion" },
        ],
      }),
    ).toMatchObject({ ok: true });
    expect(
      await f.mutation({
        action: "update",
        ref,
        expectedVersion: 1,
        fields: [{ fieldId: f.id("deal.notes"), append: "- Follow up on 2026-09-10" }],
      }),
    ).toMatchObject({ ok: true });
    expect(serializeJSONToMarkdown((await f.stored(ref, f.id("deal.notes")))?.jsonValue as object)).toBe(
      "## Context\n\nPilot budget approved.\n\n- Follow up on 2026-09-10",
    );
    expect((await f.stored(ref, f.id("deal.name")))?.textValue).toBe("Nova\n\nExpansion");
  });

  it("rejects append on other value types and keeps the version check for mixed updates", async () => {
    const f = await fixture();
    const ref = await f.createDeal("Strict");
    expect(
      await f.mutation({
        action: "update",
        ref,
        expectedVersion: 1,
        fields: [{ fieldId: f.id("deal.stage"), append: "Won" }],
      }),
    ).toMatchObject({ ok: false });
    expect(
      await f.mutation({
        action: "update",
        ref,
        expectedVersion: 1,
        fields: [{ fieldId: f.id("deal.notes"), append: "One" }],
      }),
    ).toMatchObject({ ok: true });
    expect(
      await f.mutation({
        action: "update",
        ref,
        expectedVersion: 1,
        fields: [
          { fieldId: f.id("deal.notes"), append: "Two" },
          { fieldId: f.id("deal.name"), value: { kind: "text", value: "Renamed" } },
        ],
      }),
    ).toMatchObject({ ok: false });
    expect((await f.stored(ref, f.id("deal.name")))?.textValue).toBe("Strict");
  });

  it("finds Formatted text through keyword search and the contains filter, but not its markup", async () => {
    const f = await fixture();
    const match = await f.createDeal("Alpha");
    await f.createDeal("Beta");
    await f.mutation({
      action: "update",
      ref: match,
      expectedVersion: 1,
      fields: [{ fieldId: f.id("deal.notes"), append: "Security **questionnaire** pending" }],
    });
    const names = async (input: { search?: string; filters?: unknown[] }) => {
      const result = await f.run(() =>
        f.query.invoke({
          typeId: f.id("deal"),
          fields: [f.id("deal.name")],
          filters: [],
          sort: [{ fieldId: f.id("deal.name"), direction: "asc" }],
          page: 1,
          pageSize: 25,
          ...input,
        } as never),
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data.records.map((row) => row.ref.recordId);
    };
    expect(await names({ search: "questionnaire" })).toEqual([match.recordId]);
    expect(await names({ search: "paragraph" })).toEqual([]);
    expect(
      await names({
        filters: [{ fieldId: f.id("deal.notes"), operator: "contains", value: { kind: "text", value: "pending" } }],
      }),
    ).toEqual([match.recordId]);
  });

  it("creates a new list with only its name field", async () => {
    const f = await fixture();
    const result = await f.run(async () =>
      f.configure.invoke({
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
        operations: [
          {
            operation: "createType",
            reference: "$projects",
            label: "Project",
            pluralLabel: "Projects",
            description: "",
            icon: "folder",
            embedded: false,
            accessPresetId: null,
          },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    const model = await f.run(() => new PrismaRecordRepo().getModel());
    const type = model.types.find((candidate) => candidate.label === "Project");
    expect(model.fields.filter((field) => field.typeId === type?.id).map((field) => field.valueType)).toEqual(["text"]);
  });
});
