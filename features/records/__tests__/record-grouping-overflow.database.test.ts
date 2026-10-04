import type { RecordScalar } from "../record-model.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
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
const OPTION_COUNT = MAX_AXIS_GROUPS + 5;

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
  const policy = new RecordAccessPolicy(new PrismaUserRepo(), repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { getDetails: () => Promise.resolve({ currency: "EUR" }) },
    { dispatch: () => Promise.resolve() },
  );
  const query = new QueryRecordsInteractor(repo, policy);
  const id = (key: string) => presetId(seed.company.id, key);
  const model = createCrmPreset(seed.company.id, "EUR");
  const stage = model.fields.find((field) => field.id === id("deal.stage"));
  if (!stage) throw new Error("The starter stage field is missing");
  stage.options = Array.from({ length: OPTION_COUNT }, (_, index) => ({
    id: randomUUID(),
    label: `Stage ${String(index + 1).padStart(2, "0")}`,
    color: null,
    attributes: [],
  }));
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const createDeal = async (name: string, option: string) => {
    const state = await runWithoutTenant(() =>
      prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
    );
    const value: RecordScalar = { kind: "select", value: option };
    const result = await runWithTenant(admin, () =>
      mutate.invoke({
        expectedRevision: state.revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: id("deal"),
          fields: [
            { fieldId: id("deal.name"), value: { kind: "text", value: name } },
            { fieldId: id("deal.stage"), value },
          ],
        },
      }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  };
  const grouped = () =>
    runWithTenant(admin, () => query.invoke({ typeId: id("deal"), grouping: { field: id("deal.stage") } } as never));
  return { stage, createDeal, grouped };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("grouping by a select field with more options than one axis shows", () => {
  it("lists the first groups when the options left out hold no records, and refuses once one of them does", async () => {
    const f = await fixture();
    await f.createDeal("Early", f.stage.options[0].id);
    await f.createDeal("Last shown", f.stage.options[MAX_AXIS_GROUPS - 1].id);

    const complete = await f.grouped();
    expect(complete.ok, JSON.stringify(complete)).toBe(true);
    if (!complete.ok) return;
    const groups = complete.data.grouping?.groups ?? [];
    expect(groups.filter((group) => group.key !== NO_VALUE_GROUP_KEY)).toHaveLength(MAX_AXIS_GROUPS);
    expect(groups.find((group) => group.key === `value:${f.stage.options[0].id}`)?.count).toBe(1);
    expect(groups.some((group) => group.key === `value:${f.stage.options[MAX_AXIS_GROUPS].id}`)).toBe(false);
    expect(complete.data.grouping?.total).toBe(2);

    await f.createDeal("Beyond the axis", f.stage.options[OPTION_COUNT - 1].id);
    const refused = await f.grouped();
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(JSON.stringify(refused.error)).toContain(CustomErrorCode.recordCalculationBudget);
  }, 120_000);
});
