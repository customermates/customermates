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
const { createTestRecordRepo, createTestDataViewRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordConfigurationService } = await import("@/features/records/configuration.service");
const { RecordConfigurationWriter } = await import("@/features/records/record-configuration-writer");
const { PreviewRecordConfigurationInteractor } = await import(
  "@/features/records/preview-record-configuration.interactor"
);
const { ApplyRecordConfigurationInteractor } = await import("@/features/records/configure-records.interactor");
const { recordViewStateIsValid } = await import("@/features/records/record-view-state");
const { QueryRecordMeasureInteractor } = await import("@/features/records/query-record-measure.interactor");
const { PrismaWidgetRepo } = await import("@/features/widget/prisma-widget.repository");
const { RecordWidgetReader } = await import("@/features/widget/record-widget-reader");
const { UpsertRecordWidgetInteractor } = await import("@/features/widget/record-widget.interactor");
const { getWebhookPauseNotifier } = await import("@/core/di");
const { SetupPlanSchema } = await import("../setup-plan.schema");
const { compileSetupRecordModel } = await import("../setup-model-compiler");
const { createSetupResolver } = await import("../setup-references");
const { compileSetupListDefaults } = await import("../setup-view-compiler");
const { compileSetupDashboard } = await import("../setup-dashboard-compiler");
const { agencyPlan, fieldServicePlan, saasPlan } = await import("./setup-plan-fixtures");
const { SETUP_LABELS } = await import("./setup-harness");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

async function workspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Ada",
        lastName: "Owner",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, admin };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const configurations = new RecordConfigurationService(repo);
  const preview = new PreviewRecordConfigurationInteractor(repo, policy, configurations);
  const apply = new ApplyRecordConfigurationInteractor(
    repo,
    policy,
    configurations,
    new RecordConfigurationWriter(repo, new RecordCalculationService(repo), getWebhookPauseNotifier()),
    { dispatch: () => Promise.resolve() },
  );
  const measure = new QueryRecordMeasureInteractor(repo, policy);
  const widgets = new UpsertRecordWidgetInteractor(
    new PrismaWidgetRepo(),
    repo,
    policy,
    measure,
    new RecordWidgetReader(repo, measure, new PrismaUserRepo(new PermissionService())),
    createTestDataViewRepo(),
  );
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  return { repo, preview, apply, widgets, run };
}

describeDatabase("workspace setup plan against the record engine", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it.each([
    ["agency", agencyPlan],
    ["subscription business", saasPlan],
    ["field service", fieldServicePlan],
  ])(
    "previews, applies and re-applies the %s plan on an empty workspace",
    async (_name, input) => {
      const { repo, preview, apply, widgets, run } = await workspace();
      const plan = SetupPlanSchema.parse(input);
      const setupId = randomUUID();
      const empty = await run(() => repo.getModel());
      expect(empty).toMatchObject({ revision: 0, types: [] });
      const context = { setupId, model: empty, labels: SETUP_LABELS, brandChip: "info" as const };
      const compiled = compileSetupRecordModel(plan, context);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));

      const previewed = await run(() => preview.invoke(compiled.data));
      if (!previewed.ok) throw new Error(JSON.stringify(previewed.error));
      expect(previewed.data.issues).toEqual([]);
      expect(previewed.data.valid).toBe(true);
      expect(previewed.data.execution).toBe("synchronous");

      const first = await run(() => apply.invoke(compiled.data));
      expect(first).toEqual({
        ok: true,
        data: expect.objectContaining({ status: "completed", refs: [], schemaRevision: 1 }),
      });
      const applied = await run(() => repo.getModel());
      expect(applied.revision).toBe(1);

      const again = compileSetupRecordModel(plan, context);
      expect(again).toEqual(compiled);
      if (!again.ok) return;
      expect(await run(() => apply.invoke(again.data))).toEqual(first);
      expect((await run(() => repo.getModel())).revision).toBe(1);

      const resolver = createSetupResolver(plan, { model: applied, references: previewed.data.references });
      for (const list of plan.recordModel.lists) expect(resolver.list(list.key)).toBeDefined();
      const people = plan.recordModel.lists.find((list) => list.role === "people")?.key ?? "";
      const tasks = plan.recordModel.lists.find((list) => list.role === "tasks")?.key ?? "";
      expect(applied.fields.find((field) => field.id === resolver.field(`${people}.channels`))?.format).toMatchObject({
        providerAvatar: true,
      });
      expect(applied.capabilities.map((binding) => [binding.kind, binding.typeId]).sort()).toEqual(
        [
          ["avatar", resolver.list(people)],
          ["membershipAuthorization", resolver.list(tasks)],
        ].sort(),
      );

      const views = compileSetupListDefaults(plan, resolver, applied);
      if (!views.ok) throw new Error(JSON.stringify(views.issues));
      for (const view of views.data)
        expect(recordViewStateIsValid(view.surfaceKey.slice("records:".length), view.state, applied)).toBe(true);

      const dashboard = compileSetupDashboard(plan, resolver, applied, {
        setupId,
        expectedRevision: applied.revision,
        brandChart: null,
      });
      if (!dashboard.ok) throw new Error(JSON.stringify(dashboard.issues));
      for (const widget of dashboard.data) {
        const saved = await run(() => widgets.invoke(widget));
        expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, data: { name: widget.name, status: "ready" } });
      }
    },
    60_000,
  );

  it("is rejected by the engine when the workspace changed after compiling", async () => {
    const { repo, apply, run } = await workspace();
    const plan = SetupPlanSchema.parse(agencyPlan);
    const empty = await run(() => repo.getModel());
    const compiled = compileSetupRecordModel(plan, { setupId: randomUUID(), model: empty, labels: SETUP_LABELS });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const stale = { ...compiled.data, expectedRevision: 1 };
    const result = await run(() => apply.invoke(stale));
    expect(result.ok).toBe(false);
    expect((await run(() => repo.getModel())).revision).toBe(0);
  });
});
