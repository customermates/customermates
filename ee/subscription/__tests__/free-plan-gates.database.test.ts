import type { RecordMutation } from "@/features/records/record-query.schema";

import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

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
const { WebhookPauseNotifier } = await import("@/features/webhook/webhook-pause-notifier");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { ApplyRecordConfigurationInteractor } = await import("@/features/records/configure-records.interactor");
const { RecordConfigurationService } = await import("@/features/records/configuration.service");
const { RecordConfigurationWriter } = await import("@/features/records/record-configuration-writer");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PlanLimitsService } = await import("../plan-limits.service");
const { PrismaPlanUsageRepo } = await import("../prisma-plan-usage.repository");
const { ApiRateLimitService } = await import("../api-rate-limit.service");
const { PrismaApiRateLimitRepo } = await import("../prisma-api-rate-limit.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const DAY_MS = 86_400_000;

async function fixture(subscription: { status: "trial" | "active"; trialEndDate: Date | null }) {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    await prisma.subscription.create({
      data: { companyId: company.id, plan: "pro", agentCreditAnchorAt: new Date(), ...subscription },
    });
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
  const limits = () => new PlanLimitsService(new PrismaPlanUsageRepo(), "cloud");
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(
    new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
    repo,
  );
  const calculations = new RecordCalculationService(repo);
  const background = { dispatch: () => Promise.resolve() };
  const id = (key: string) => presetId(seed.company.id, key);
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  await run(() =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const mutate = (value: RecordMutation) =>
    run(async () =>
      new MutateRecordInteractor(
        repo,
        policy,
        new RecordWriteService(repo, policy, calculations, undefined, undefined, undefined, limits()),
        background,
        new RecordTrashService(repo, new RecordCalculationService(repo), limits()),
      ).invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
  const createList = (label: string) =>
    run(async () =>
      new ApplyRecordConfigurationInteractor(
        repo,
        policy,
        new RecordConfigurationService(repo),
        new RecordConfigurationWriter(
          repo,
          calculations,
          new WebhookPauseNotifier(
            { getWebhookByIdOrThrow: () => Promise.reject(new Error("No webhook expected")) },
            { publish: () => Promise.resolve() },
          ),
        ),
        background,
      ).invoke({
        expectedRevision: await revision(),
        idempotencyKey: randomUUID(),
        operations: [
          {
            operation: "createType",
            reference: `$${label.toLowerCase()}`,
            label,
            pluralLabel: `${label}s`,
            description: "",
            icon: "folder",
            embedded: false,
            accessPresetId: null,
          },
        ],
      }),
    );
  const seedDeals = (count: number) =>
    runWithoutTenant(() =>
      prisma.crmRecord.createMany({
        data: Array.from({ length: count }, () => ({
          companyId: seed.company.id,
          typeId: id("deal"),
          id: randomUUID(),
        })),
      }),
    );
  const createDeal = () =>
    mutate({
      action: "create",
      typeId: id("deal"),
      fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Deal" } }],
    });
  return { seed, admin, run, limits, mutate, createList, seedDeals, createDeal, id };
}

function failureCode(result: unknown) {
  const outcome = result as { ok: boolean; error?: { issues: Array<{ params?: Record<string, unknown> }> } };
  return outcome.ok ? null : outcome.error?.issues[0]?.params?.error;
}

describeDatabase("Free plan gates", () => {
  beforeAll(() => preloadTestRecordRepo(), 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("refuses the 251st record of a workspace whose trial ended and counts neither trash nor sublist rows", async () => {
    const f = await fixture({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });
    await f.seedDeals(249);
    await runWithoutTenant(() =>
      prisma.crmRecord.create({
        data: { companyId: f.seed.company.id, typeId: f.id("deal"), id: randomUUID(), deletedAt: new Date() },
      }),
    );

    expect((await f.createDeal()).ok).toBe(true);
    const refused = await f.createDeal();
    expect(failureCode(refused)).toBe("planRecordLimitReached");
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.count({ where: { companyId: f.seed.company.id, deletedAt: null } }),
      ),
    ).toBe(250);
  }, 120_000);

  it("keeps records unlimited during the trial", async () => {
    const f = await fixture({ status: "trial", trialEndDate: new Date(Date.now() + DAY_MS) });
    await f.seedDeals(250);

    expect((await f.createDeal()).ok).toBe(true);
  }, 120_000);

  it("keeps custom lists unlimited on Free", async () => {
    const f = await fixture({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });

    for (const label of ["Project", "Partner", "Event", "Venue"]) expect((await f.createList(label)).ok).toBe(true);
  }, 120_000);

  it("counts the active member and pending join requests toward the one person", async () => {
    const f = await fixture({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });
    await runWithoutTenant(() =>
      prisma.user.createMany({
        data: [
          {
            companyId: f.seed.company.id,
            firstName: "A",
            lastName: "A",
            email: `${randomUUID()}@example.test`,
            status: "pendingAuthorization",
          },
          {
            companyId: f.seed.company.id,
            firstName: "B",
            lastName: "B",
            email: `${randomUUID()}@example.test`,
            status: "inactive",
          },
        ],
      }),
    );

    expect(await f.limits().admitMembers(1, f.seed.company.id)).toMatchObject({ limit: 1 });
    await runWithoutTenant(() =>
      prisma.user.updateMany({
        where: { companyId: f.seed.company.id, status: "pendingAuthorization" },
        data: { status: "inactive", leftAt: new Date() },
      }),
    );
    expect(await f.limits().admitMembers(1, f.seed.company.id)).toMatchObject({ limit: 1 });
  }, 120_000);

  it("limits API and MCP requests of a Free workspace per minute in Postgres", async () => {
    const f = await fixture({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });
    const limiter = new ApiRateLimitService(
      new PrismaApiRateLimitRepo(),
      async (companyId) => (await f.limits().plan(companyId)).limits,
    );
    const now = new Date("2026-11-07T10:00:30.000Z");

    const results = await Promise.all(Array.from({ length: 30 }, () => limiter.admit(f.seed.company.id, now)));
    expect(results.every((result) => result === null)).toBe(true);
    expect(await limiter.admit(f.seed.company.id, now)).toEqual({ window: "minute", limit: 30, retryAfterSeconds: 30 });
    expect(await limiter.admit(f.seed.company.id, new Date("2026-11-07T10:01:00.000Z"))).toBeNull();
  }, 120_000);

  it("does not limit the requests of a paid workspace", async () => {
    const f = await fixture({ status: "active", trialEndDate: null });
    const limiter = new ApiRateLimitService(
      new PrismaApiRateLimitRepo(),
      async (companyId) => (await f.limits().plan(companyId)).limits,
    );

    for (let index = 0; index < 11; index++) expect(await limiter.admit(f.seed.company.id)).toBeNull();
    expect(
      await runWithoutTenant(() => prisma.apiRateLimitWindow.count({ where: { companyId: f.seed.company.id } })),
    ).toBe(0);
  }, 120_000);
});
