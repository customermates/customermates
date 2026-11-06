import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PermissionService } from "@/core/base/permission.service";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import { recordColumns } from "../record-columns";

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
const { createTestRecordRepo, createTestDataViewRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { QueryRecordsInteractor } = await import("../query-records.interactor");
const { GetRecordPresentationInteractor } = await import("../get-record-presentation.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { RecordQuerySchema } = await import("../record-query.schema");

const companies: string[] = [];
async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({ data: { companyId: company.id, name: "Admin", isSystemRole: true } });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Read",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const actor = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const run = <T>(work: () => Promise<T>) => runWithTenant(actor, work);
  const repo = createTestRecordRepo();
  const members = new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
  const policy = new RecordAccessPolicy(members, repo);
  const model = createCrmPreset(seed.company.id);
  await run(() => runInTransaction(() => repo.saveModel(model, actor.id)));
  const id = (key: string) => presetId(seed.company.id, key);
  return { ...seed, actor, run, repo, members, policy, model, id, typeId: id("deal") };
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("read performance without stale permissions or values", () => {
  it("retains the all-fields read for layouts wider than the query projection limit", async () => {
    const f = await fixture();
    const wide = {
      ...f.model,
      revision: f.model.revision + 1,
      fields: [
        ...f.model.fields,
        ...Array.from({ length: 101 }, (_, index) => ({
          ...f.model.fields[0],
          id: randomUUID(),
          typeId: f.typeId,
          label: `Wide field ${index}`,
          position: 100 + index,
          valueType: "text" as const,
          behavior: { kind: "input" as const },
        })),
      ],
    };
    await f.run(() => runInTransaction(() => f.repo.saveModel(wide, f.actor.id)));
    const presentation = new GetRecordPresentationInteractor(
      f.repo,
      f.policy,
      createTestDataViewRepo(),
      new QueryRecordsInteractor(f.repo, f.policy),
    );
    const result = await f.run(() =>
      presentation.invoke({
        typeId: f.typeId,
        params: {},
        columns: wide.fields.filter((field) => field.typeId === f.typeId).map((field) => field.id),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.data.query.fields).toBeUndefined();
    expect(result.data.result.items).toEqual([]);
  });

  it("shares model and policy objects across repository instances only for one read snapshot", async () => {
    const f = await fixture();
    const other = createTestRecordRepo();
    const otherPolicy = new RecordAccessPolicy(f.members, other);
    await f.run(() =>
      runInTransaction(
        async () => {
          const models = await Promise.all([f.repo.getModel(), other.getModel()]);
          const policies = await Promise.all([f.policy.load(), otherPolicy.load()]);
          expect(models[0]).toBe(models[1]);
          expect(policies[0]).toBe(policies[1]);
          expect(policies[0].canReadType(f.typeId)).toBe(true);
        },
        { readOnly: true },
      ),
    );
    await f.run(() =>
      runInTransaction(async () => {
        const before = await f.repo.getModel();
        await f.repo.saveModel({ ...before, revision: before.revision + 1 }, f.actor.id);
        expect((await other.getModel()).revision).toBe(before.revision + 1);
      }),
    );
    await runWithoutTenant(() => prisma.user.update({ where: { id: f.user.id }, data: { status: "inactive" } }));
    await f.run(() =>
      runInTransaction(
        async () => {
          expect((await f.repo.getModel()).revision).toBe(f.model.revision + 1);
          expect((await otherPolicy.load()).canReadType(f.typeId)).toBe(false);
        },
        { readOnly: true },
      ),
    );
  });

  it("keeps models and policy actors separate across tenants and users within a snapshot", async () => {
    const f = await fixture();
    const other = await fixture();
    await f.run(() =>
      runInTransaction(
        async () => {
          const model = await f.repo.getModel();
          const policy = await f.policy.load();
          await other.run(async () => {
            expect((await other.repo.getModel()).types.map((type) => type.id)).not.toEqual(
              model.types.map((type) => type.id),
            );
            expect((await other.policy.load()).actor?.id).toBe(other.user.id);
          });
          const differentUser = createMockUser({ ...f.actor, id: randomUUID() });
          await runWithTenant(differentUser, async () => {
            const restricted = await f.policy.load();
            expect(restricted).not.toBe(policy);
            expect(restricted.canReadType(f.typeId)).toBe(false);
          });
          expect((await f.policy.load()).actor?.id).toBe(f.user.id);
        },
        { readOnly: true },
      ),
    );
  });

  it("projects database hydration and permission columns, keeping hidden predicates and grouping correct", async () => {
    const f = await fixture();
    const recordId = randomUUID();
    await runWithoutTenant(async () => {
      await prisma.crmRecord.create({
        data: {
          companyId: f.company.id,
          typeId: f.typeId,
          id: recordId,
          values: {
            create: [
              {
                fieldId: f.id("deal.name"),
                state: "value",
                schemaRevision: f.model.revision,
                textValue: "Projected deal",
              },
              {
                fieldId: f.id("deal.notes"),
                state: "value",
                schemaRevision: f.model.revision,
                jsonValue: {
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden detail ".repeat(1000) }] }],
                },
              },
              {
                fieldId: f.id("deal.stage"),
                state: "value",
                schemaRevision: f.model.revision,
                textValue: f.id("deal.stage.new"),
              },
            ],
          },
        },
      });
    });
    const query = RecordQuerySchema.parse({
      typeId: f.typeId,
      fields: [f.id("deal.name")],
      filters: [
        { fieldId: f.id("deal.stage"), operator: "eq", value: { kind: "select", value: f.id("deal.stage.new") } },
      ],
    });
    await f.run(() =>
      runInTransaction(
        async () => {
          const policy = await f.policy.load();
          const raw = await f.repo.query(query, f.model, policy.access([f.typeId]), policy.memberScope);
          expect(raw.records).toHaveLength(1);
          expect(raw.records[0].values.map((value) => value.fieldId)).toEqual([f.id("deal.name")]);
          expect([...(raw.visibleFields.get(recordId) ?? [])]).toEqual([f.id("deal.name")]);
          const grouped = await f.repo.query(
            { ...query, grouping: { field: f.id("deal.stage") } },
            f.model,
            policy.access([f.typeId]),
            policy.memberScope,
          );
          expect(
            "grouping" in grouped &&
              grouped.grouping?.groups.find((group) => group.key === `value:${f.id("deal.stage.new")}`)?.count,
          ).toBe(1);
          expect(grouped.records[0].values.map((value) => value.fieldId)).toEqual([f.id("deal.name")]);
          expect(
            (await f.repo.query({ ...query, fields: [] }, f.model, policy.access([f.typeId]), policy.memberScope))
              .records[0].values,
          ).toEqual([]);
          expect((await f.repo.getRecordsCompanyWide([{ typeId: f.typeId, recordId }]))[0].values).toHaveLength(3);
        },
        { readOnly: true },
      ),
    );
    const views = createTestDataViewRepo();
    const hiddenColumns = recordColumns(f.typeId, f.model)
      .filter((column) => column.id !== f.id("deal.name"))
      .map((column) => column.id);
    vi.spyOn(views, "loadSurfaceState").mockResolvedValue({
      views: [],
      allState: { hiddenColumns },
      activeViewKey: "__all__",
    });
    const presentation = new GetRecordPresentationInteractor(
      f.repo,
      f.policy,
      views,
      new QueryRecordsInteractor(f.repo, f.policy),
    );
    const initial = await f.run(() => presentation.invoke({ typeId: f.typeId, params: {} }));
    expect(initial).toMatchObject({ ok: true, data: { query: { fields: [f.id("deal.name")] } } });
    if (!initial.ok) throw initial.error;
    expect(initial.data.model.fields).toHaveLength(f.model.fields.filter((field) => field.typeId === f.typeId).length);
    expect(initial.data.result.items[0].fields.map((field) => field.fieldId)).toEqual([f.id("deal.name")]);
    const revealed = await f.run(() =>
      presentation.invoke({ typeId: f.typeId, params: {}, columns: [f.id("deal.notes"), randomUUID()] }),
    );
    expect(revealed).toMatchObject({ ok: true, data: { query: { fields: [f.id("deal.name"), f.id("deal.notes")] } } });
  });
});
