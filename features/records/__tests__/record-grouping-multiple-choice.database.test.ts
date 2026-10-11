import { PermissionService } from "@/core/base/permission.service";
import type { RecordField } from "../record-model.schema";

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
const { GetRecordPresentationInteractor } = await import("../get-record-presentation.interactor");
const { RecordViewPolicy } = await import("../record-view-policy");
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
  const typeId = id("contact");
  const model = createCrmPreset(seed.company.id);
  const role: RecordField = {
    id: randomUUID(),
    typeId,
    label: "Role",
    valueType: "select",
    multiple: true,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: ["Decision maker", "Champion", "Influencer"].map((label) => ({
      id: randomUUID(),
      label,
      color: null,
      attributes: [],
    })),
    position: model.fields.filter((field) => field.typeId === typeId).length,
  };
  model.fields.push(role);
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const state = await runWithoutTenant(() =>
    prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
  );
  const created = await runWithTenant(admin, () =>
    mutate.invoke({
      expectedRevision: state.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          { fieldId: id("contact.name"), value: { kind: "text", value: "Ada" } },
          { fieldId: role.id, value: { kind: "selectList", value: [role.options[0].id, role.options[1].id] } },
        ],
      },
    }),
  );
  expect(created, JSON.stringify(created)).toMatchObject({ ok: true });
  const viewId = randomUUID();
  const views = {
    loadSurfaceState: () =>
      Promise.resolve({
        activeViewKey: viewId,
        views: [{ id: viewId, name: "By role", position: 0, state: { grouping: { field: role.id } } }],
        allState: {},
      }),
  };
  const presentation = new GetRecordPresentationInteractor(repo, policy, views as never, query);
  const present = (params: Record<string, unknown>) =>
    runWithTenant(admin, () => presentation.invoke({ typeId, params } as never));
  const viewPolicy = new RecordViewPolicy(repo, policy);
  return { typeId, role, id, present, admin, viewPolicy };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("grouping a records list by a multiple choice field", () => {
  it("shows a saved view or a link that groups by one ungrouped instead of failing the page", async () => {
    const f = await fixture();

    const saved = await f.present({ viewId: undefined });
    expect(saved.ok, JSON.stringify(saved)).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.result.grouping).toBeUndefined();
    expect(saved.data.query.grouping).toBeUndefined();
    expect(saved.data.result.items.map((item) => item.id)).toHaveLength(1);
    expect((saved.data.result.groupableFields ?? []).some((field) => field.grouping.field === f.role.id)).toBe(false);

    const linked = await f.present({ viewId: "__all__", grouping: { field: f.role.id } });
    expect(linked.ok, JSON.stringify(linked)).toBe(true);
    if (linked.ok) expect(linked.data.result.grouping).toBeUndefined();

    const assigned = await f.present({ viewId: "__all__", grouping: { field: "system:assignedTo" } });
    expect(assigned.ok, JSON.stringify(assigned)).toBe(true);
    if (assigned.ok) expect(assigned.data.result.grouping?.grouping.field).toBe("system:assignedTo");
  }, 120_000);

  it("names the groupable fields when a view would group by it", async () => {
    const f = await fixture();
    const surfaceKey = `records:${f.typeId}`;
    const refused = await runWithTenant(f.admin, () =>
      f.viewPolicy.unsupportedGrouping(surfaceKey, { field: f.role.id }),
    );
    expect(refused).not.toBeNull();
    expect(refused).not.toContain(f.role.id);
    expect(refused).toContain("system:assignedTo");
    expect(
      await runWithTenant(f.admin, () => f.viewPolicy.unsupportedGrouping(surfaceKey, { field: "system:assignedTo" })),
    ).toBeNull();
  }, 120_000);
});
