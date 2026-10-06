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
const { createCrmPreset, presetId } = await import("../crm-preset");

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
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
  );
  const query = new QueryRecordsInteractor(repo, policy);
  const id = (key: string) => presetId(seed.company.id, key);
  const model = createCrmPreset(seed.company.id);
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const createDeal = async (name: string) => {
    const state = await runWithoutTenant(() =>
      prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
    );
    const result = await runWithTenant(admin, () =>
      mutate.invoke({
        expectedRevision: state.revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: id("deal"),
          fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: name } }],
        },
      }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  };
  const page = (pageNumber: number, pageSize: number) =>
    runWithTenant(admin, () =>
      query.invoke({
        typeId: id("deal"),
        fields: [id("deal.name")],
        sort: [{ fieldId: id("deal.name"), direction: "asc" }],
        page: pageNumber,
        pageSize,
      } as never),
    );
  return { id, createDeal, page };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("query_crm_records page windows", () => {
  it("serves any page size exactly, counts pages in that size and echoes both", async () => {
    const f = await fixture();
    for (let index = 1; index <= 16; index += 1) await f.createDeal(`Window-${String(index).padStart(2, "0")}`);
    const names = (result: Awaited<ReturnType<typeof f.page>>) =>
      result.ok
        ? result.data.records.map((record) => {
            const name = record.fields.find((field) => field.fieldId === f.id("deal.name"))?.result;
            return name?.state === "value" && name.value.kind === "text" ? name.value.value : null;
          })
        : [];

    const second = await f.page(2, 7);
    expect(second.ok && { page: second.data.page, pageSize: second.data.pageSize, total: second.data.total }).toEqual({
      page: 2,
      pageSize: 7,
      total: 16,
    });
    expect(names(second)).toEqual(
      Array.from({ length: 7 }, (_, index) => `Window-${String(index + 8).padStart(2, "0")}`),
    );
    const last = await f.page(3, 7);
    expect(names(last)).toEqual(["Window-15", "Window-16"]);
    const wide = await f.page(1, 500);
    expect(wide.ok && wide.data.pageSize).toBe(500);
    expect(names(wide)).toHaveLength(16);
  }, 120_000);
});
