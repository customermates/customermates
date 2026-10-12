import type { RecordRef } from "../record-model.schema";
import type { RecordMutation } from "../record-query.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { PermissionService } from "@/core/base/permission.service";
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
const { PrismaP13nRepo } = await import("@/features/p13n/prisma-p13n.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { RecordTrashService } = await import("../record-trash.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { QueryRecordsInteractor } = await import("../query-records.interactor");
const { RecordDetailLayoutReader } = await import("../record-detail-layout-reader");
const { EmbeddedSublistReader } = await import("../embedded-sublist-reader");
const { GetRecordEditorInteractor } = await import("../get-record-editor.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { sublistColumnsP13nId } = await import("@/features/p13n/sublist-columns.schema");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

async function fixture() {
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
  const calculations = new RecordCalculationService(repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, calculations),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo),
  );
  const personalization = new PrismaP13nRepo();
  const editor = new GetRecordEditorInteractor(
    repo,
    policy,
    new RecordDetailLayoutReader(personalization),
    new EmbeddedSublistReader(new QueryRecordsInteractor(repo, policy), personalization),
  );
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const id = (key: string) => presetId(seed.company.id, key);
  const run = <T>(fn: () => Promise<T>, as = admin) => runWithTenant(as, fn);
  const create = async (type: string, name: string, links?: Extract<RecordMutation, { action: "create" }>["links"]) => {
    const result = await run(() =>
      mutate.invoke({
        mutation: {
          action: "create",
          typeId: id(type),
          fields: [{ fieldId: id(`${type}.name`), value: { kind: "text", value: name } }],
          links,
        },
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(`Fixture creation failed: ${type}`);
    const ref = result.data.refs.find((candidate) => candidate.typeId === id(type));
    if (!ref) throw new Error(`Fixture creation returned no ${type}`);
    return ref;
  };
  return { ...seed, admin, member, repo, editor, personalization, id, run, create };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record editor embedded sub-lists", { timeout: 120_000 }, () => {
  it("returns the first page of each sub-list with the editor payload, within the reader's access", async () => {
    const f = await fixture();
    const deal = await f.create("deal", "Renewal");
    const service = await f.create("service", "Onboarding");
    const lineItem = f.id("lineItem");
    const parent = (ref: RecordRef) => ({
      relationId: f.id("lineItem.deal"),
      direction: "outgoing" as const,
      record: ref,
    });
    const links = [
      parent(deal),
      { relationId: f.id("lineItem.service"), direction: "outgoing" as const, record: service },
    ];
    for (let index = 0; index < 11; index++) await f.create("lineItem", `Line ${index}`, links);

    const forAdmin = await f.run(() => f.editor.invoke(deal));
    if (!forAdmin.ok) throw new Error("The admin could not read the deal");
    const page = forAdmin.data.embedded?.[lineItem];
    expect(page).toMatchObject({ columns: null, rows: { total: 11, page: 1, pageSize: 10 } });
    expect(page?.rows.records).toHaveLength(10);
    expect(page?.totals.length).toBeGreaterThan(0);
    expect(
      page?.rows.records.every((record) =>
        record.relationships.some(
          (summary) => summary.relationId === f.id("lineItem.service") && summary.records.length,
        ),
      ),
    ).toBe(true);

    expect(await f.run(() => f.editor.invoke(deal), f.member)).toMatchObject({ ok: false });

    await f.run(() =>
      runInTransaction(() => f.repo.setGrants(f.id("deal"), [{ roleId: f.memberRole.id, actions: ["readAll"] }])),
    );
    const forMember = await f.run(() => f.editor.invoke(deal), f.member);
    if (!forMember.ok) throw new Error("The member could not read the deal");
    const memberPage = forMember.data.embedded?.[lineItem];
    expect(memberPage?.rows.total).toBe(11);
    expect(forMember.data.model.relationships.some((relation) => relation.id === f.id("lineItem.service"))).toBe(false);
    expect(memberPage?.rows.records.every((record) => record.relationships.length === 0)).toBe(true);

    const chosen = [f.id("lineItem.quantity")];
    await f.run(() =>
      f.personalization.upsertP13n({ p13nId: sublistColumnsP13nId(lineItem), settings: { columns: chosen } }),
    );
    const personal = await f.run(() => f.editor.invoke(deal));
    if (!personal.ok) throw new Error("The admin could not read the deal again");
    expect(personal.data.embedded?.[lineItem]?.columns).toEqual(chosen);
    expect(personal.data.embedded?.[lineItem]?.rows.records.every((record) => record.relationships.length === 0)).toBe(
      true,
    );
    const memberAgain = await f.run(() => f.editor.invoke(deal), f.member);
    expect(memberAgain.ok && memberAgain.data.embedded?.[lineItem]?.columns).toBeNull();

    const created = await f.run(() => f.editor.invoke({ typeId: f.id("deal") }));
    expect(created.ok && created.data.embedded).toBeUndefined();
  });
});
