import { recordInvariant } from "@/features/records/record-invariant";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PermissionService } from "@/core/base/permission.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { FilterOperatorKey as Op } from "@/core/base/base-query-builder";
import { createRecordQueryFilterTarget } from "@/components/records/record-query-filter-target";
import type { QueryFilters } from "../record-filter-target";
import type { RecordField, RecordScalar } from "../record-model.schema";
import type { RecordMutation } from "../record-query.schema";
import { RecordQuerySchema } from "../record-query.schema";
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
const labels = {
  createdAt: "Created",
  updatedAt: "Updated",
  assignedTo: "Assigned",
  search: "Search",
  records: "Records",
  any: "Any",
  none: "None",
  unavailable: "Unavailable",
};
const textValue = (value: string): RecordScalar => ({ kind: "text", value });
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
        firstName: "Palette",
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
  const scalar = randomUUID();
  const multiple = randomUUID();
  const fields: RecordField[] = [false, true].map((isMultiple, index) => ({
    id: isMultiple ? multiple : scalar,
    typeId: id("deal"),
    label: isMultiple ? "Aliases" : "Reference",
    valueType: "text",
    multiple: isMultiple,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 100 + index,
  }));
  model.fields.push(...fields);
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const mutation = async (mutation: RecordMutation) => {
    const result = await runWithTenant(admin, () =>
      mutate.invoke({ expectedRevision: 1, idempotencyKey: randomUUID(), mutation }),
    );
    if (!result.ok) throw result.error;
    return result.data;
  };
  const names = async (filters: QueryFilters) => {
    const result = await runWithTenant(admin, () =>
      query.invoke(RecordQuerySchema.parse({ typeId: id("deal"), ...filters })),
    );
    if (!result.ok) throw result.error;
    return result.data.records
      .map((record) => {
        const name = record.fields.find((field) => field.fieldId === id("deal.name"))?.result;
        return name?.state === "value" && name.value.kind === "text" ? name.value.value : "";
      })
      .sort();
  };
  const host = (initial: QueryFilters) => {
    let filters = initial;
    const target = createRecordQueryFilterTarget({
      model,
      typeId: id("deal"),
      labels,
      read: () => filters,
      write: (next) => {
        filters = next;
      },
      isDisabled: () => false,
      identity: () => initial,
    });
    return { target, read: () => filters };
  };
  return { id, scalar, multiple, mutation, names, host };
}
afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});
describeDatabase("record palette query semantics", () => {
  it("keeps scalar and multi-text not-equal semantics including empty and mixed values", async () => {
    const f = await fixture();
    const values: Array<[string, string | undefined, string[] | undefined]> = [
      ["Missing", undefined, undefined],
      ["Empty", undefined, []],
      ["Matches", "wanted", ["wanted"]],
      ["Other", "other", ["other"]],
      ["Mixed", "wanted", ["wanted", "other"]],
    ];
    for (const [name, scalar, list] of values) {
      await f.mutation({
        action: "create",
        typeId: f.id("deal"),
        fields: [
          { fieldId: f.id("deal.name"), value: textValue(name) },
          ...(scalar === undefined ? [] : [{ fieldId: f.scalar, value: textValue(scalar) }]),
          ...(list === undefined
            ? []
            : [{ fieldId: f.multiple, value: list.length ? { kind: "textList" as const, value: list } : null }]),
        ],
      });
    }
    for (const fieldId of [f.scalar, f.multiple]) {
      const original: QueryFilters = {
        filters: [{ fieldId, operator: "ne", value: textValue("wanted") }],
        relationships: [],
      };
      const host = f.host(original);
      expect(host.target.filters).toEqual([{ field: fieldId, operator: Op.notEquals, value: "wanted" }]);
      expect(await f.names(original)).toEqual(["Empty", "Missing", "Other"]);
      host.target.setQueryOptions({ filters: recordInvariant(host.target.filters) });
      expect(await f.names(host.read())).toEqual(["Empty", "Missing", "Other"]);
    }
  }, 120000);
  it("keeps same-path groups as independent EXISTS clauses through an unrelated palette edit", async () => {
    const f = await fixture();
    const refs = [];
    for (const name of ["First", "Second"]) {
      const result = await f.mutation({
        action: "create",
        typeId: f.id("organization"),
        fields: [{ fieldId: f.id("organization.name"), value: textValue(name) }],
      });
      if (result.status !== "completed" || !result.refs[0]) throw new Error("Expected created record");
      refs.push(result.refs[0]);
    }
    await f.mutation({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: textValue("Linked deal") }],
      links: refs.map((record) => ({ relationId: f.id("deal.organizations"), direction: "outgoing" as const, record })),
    });
    const groups = ["First", "Second"].map((name) => ({
      path: [{ relationId: f.id("deal.organizations"), direction: "outgoing" as const }],
      operator: "any" as const,
      filters: [{ fieldId: f.id("organization.name"), operator: "eq" as const, value: textValue(name) }],
      relationships: [],
    }));
    const original = { filters: [], relationships: [], relatedFilters: groups };
    expect(await f.names(original)).toEqual(["Linked deal"]);
    expect(
      await f.names({
        ...original,
        relatedFilters: [{ ...groups[0], filters: groups.flatMap((group) => group.filters) }],
      }),
    ).toEqual([]);
    const host = f.host(original);
    host.target.setQueryOptions({ filters: [{ field: "query:search", operator: Op.contains, value: "Linked" }] });
    expect(await f.names(host.read())).toEqual(["Linked deal"]);
    expect(host.read().relatedFilters).toEqual(groups);
  }, 120000);
});
