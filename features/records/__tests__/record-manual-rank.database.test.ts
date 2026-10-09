import { PermissionService } from "@/core/base/permission.service";
import type { RecordMutation } from "../record-query.schema";

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
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const MANUAL = [{ fieldId: "system:manual", direction: "asc" }];

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
  const mutator = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
  );
  const query = new QueryRecordsInteractor(repo, policy);
  const id = (key: string) => presetId(seed.company.id, key);
  const model = createCrmPreset(seed.company.id);
  const stage = model.fields.find((field) => field.id === id("deal.stage"));
  if (!stage) throw new Error("The starter stage field is missing");
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const mutate = async (mutation: RecordMutation) =>
    runWithTenant(admin, async () =>
      mutator.invoke({ expectedRevision: await revision(), idempotencyKey: randomUUID(), mutation }),
    );
  const names = new Map<string, string>();
  const createDeal = async (name: string, option: string) => {
    const result = await mutate({
      action: "create",
      typeId: id("deal"),
      fields: [
        { fieldId: id("deal.name"), value: { kind: "text", value: name } },
        { fieldId: id("deal.stage"), value: { kind: "select", value: option } },
      ],
    });
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const recordId = result.data.refs[0].recordId;
    names.set(recordId, name);
    return recordId;
  };
  const stored = (recordId: string) =>
    runWithoutTenant(() => prisma.crmRecord.findFirstOrThrow({ where: { companyId: seed.company.id, id: recordId } }));
  const move = async (
    recordId: string,
    placement: Record<string, string>,
    fields: Array<{ fieldId: string; value: { kind: "select"; value: string } }> = [],
  ) =>
    mutate({
      action: "update",
      ref: { typeId: id("deal"), recordId },
      expectedVersion: (await stored(recordId)).version,
      fields,
      placement,
    });
  const sorted = (sort: Array<{ fieldId: string; direction: string }>) =>
    runWithTenant(admin, () => query.invoke({ typeId: id("deal"), sort, pageSize: 100 } as never));
  const ordered = async () => {
    const result = await sorted(MANUAL);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.data.records.map((record) => names.get(record.ref.recordId));
  };
  const columns = async () => {
    const result = await runWithTenant(admin, () =>
      query.invoke({ typeId: id("deal"), sort: MANUAL, grouping: { field: id("deal.stage") } } as never),
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    return Object.fromEntries(
      (result.data.grouping?.groups ?? []).map((group) => [
        group.key,
        group.itemIds.map((recordId) => names.get(recordId)),
      ]),
    );
  };
  const history = (recordId: string) =>
    runWithoutTenant(() => prisma.eventLog.count({ where: { companyId: seed.company.id, subjectId: recordId } }));
  return { id, stage, createDeal, stored, move, sorted, ordered, columns, history };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("manual record order", () => {
  it("keeps creation order for unranked records and moves records between any neighbours", async () => {
    const f = await fixture();
    const open = f.stage.options[0].id;
    const a = await f.createDeal("A", open);
    const b = await f.createDeal("B", open);
    const cId = await f.createDeal("C", open);
    expect(await f.ordered()).toEqual(["C", "B", "A"]);

    const version = (await f.stored(a)).version;
    const events = await f.history(a);

    expect(await f.move(a, { afterRecordId: cId })).toMatchObject({ ok: true });
    expect(await f.ordered()).toEqual(["C", "A", "B"]);
    expect((await f.stored(a)).version).toBe(version);
    expect(await f.history(a)).toBe(events);

    expect(await f.move(b, { beforeRecordId: cId })).toMatchObject({ ok: true });
    expect(await f.ordered()).toEqual(["B", "C", "A"]);
    expect(await f.move(a, {})).toMatchObject({ ok: true });
    expect(await f.ordered()).toEqual(["A", "B", "C"]);
    expect(await f.move(a, { afterRecordId: b, beforeRecordId: cId })).toMatchObject({ ok: true });
    expect(await f.ordered()).toEqual(["B", "A", "C"]);
  });

  it("moves a card into another column at the dropped position in the same request", async () => {
    const f = await fixture();
    const [open, won] = [f.stage.options[0].id, f.stage.options[1].id];
    const first = await f.createDeal("Open 1", open);
    await f.createDeal("Open 2", open);
    const winner = await f.createDeal("Won 1", won);
    await f.createDeal("Won 2", won);
    const version = (await f.stored(winner)).version;

    const moved = await f.move(winner, { afterRecordId: first, groupFieldId: f.id("deal.stage") }, [
      { fieldId: f.id("deal.stage"), value: { kind: "select", value: open } },
    ]);
    expect(moved, JSON.stringify(moved)).toMatchObject({ ok: true });
    const columns = await f.columns();
    expect(columns[`value:${open}`]).toEqual(["Open 2", "Open 1", "Won 1"]);
    expect(columns[`value:${won}`]).toEqual(["Won 2"]);
    expect((await f.stored(winner)).version).toBe(version + 1);

    expect(await f.move(winner, { groupFieldId: f.id("deal.stage") })).toMatchObject({ ok: true });
    expect((await f.columns())[`value:${open}`]).toEqual(["Won 1", "Open 2", "Open 1"]);
  });

  it("rejects unknown anchors, non choice group fields and a descending manual sort", async () => {
    const f = await fixture();
    const open = f.stage.options[0].id;
    const deal = await f.createDeal("Lonely", open);
    expect(await f.move(deal, { afterRecordId: randomUUID() })).toMatchObject({ ok: false });
    expect(await f.move(deal, { groupFieldId: f.id("deal.name") })).toMatchObject({ ok: false });
    expect(await f.move(deal, { afterRecordId: deal })).toMatchObject({ ok: false });
    expect(await f.sorted([{ fieldId: "system:manual", direction: "desc" }])).toMatchObject({ ok: false });
  });
});
