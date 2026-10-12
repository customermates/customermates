import type { Action } from "@/generated/prisma";
import type { RecordRef } from "../record-model.schema";

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
const { Prisma } = await import("@/generated/prisma");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { recordAccessForActor } = await import("../record-access");
const { recordReadPredicate } = await import("../record-query");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

type RoleCase = { name: string; system?: boolean; grants: Array<[string, Action[]]> };

const ROLES: RoleCase[] = [
  { name: "administrator", system: true, grants: [] },
  { name: "deals read all", grants: [["deal", ["readAll"]]] },
  { name: "deals read own", grants: [["deal", ["readOwn"]]] },
  { name: "deals read all and own", grants: [["deal", ["readAll", "readOwn"]]] },
  { name: "line items only", grants: [["lineItem", ["readAll"]]] },
  { name: "contacts only", grants: [["contact", ["readAll"]]] },
  { name: "no grants", grants: [] },
];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record read rule parity", () => {
  it("agrees between canRead and the SQL read predicate across roles, assignments and parent scopes", async () => {
    const seed = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      companies.push(company.id);
      const roles = [];
      for (const role of ROLES) {
        const row = await prisma.userRole.create({
          data: { companyId: company.id, name: role.name, isSystemRole: role.system === true },
        });
        const user = await prisma.user.create({
          data: {
            companyId: company.id,
            roleId: row.id,
            firstName: role.name,
            lastName: "Test",
            email: `${randomUUID()}@example.test`,
            status: "active",
          },
        });
        roles.push({ ...role, role: row, user });
      }
      return { company, roles };
    });
    const companyId = seed.company.id;
    const [administrator] = seed.roles;
    const admin = createMockUser({ ...administrator.user, role: { ...administrator.role, permissions: [] } });
    const repo = new PrismaRecordRepo();
    const model = createCrmPreset(companyId);
    await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
    const id = (key: string) => presetId(companyId, key);
    const own = seed.roles.find((role) => role.name === "deals read own");
    if (!own) throw new Error("Missing own role");

    const refs: Array<RecordRef & { label: string }> = [];
    await runWithoutTenant(async () => {
      await prisma.recordTypeGrant.deleteMany({ where: { companyId } });
      await prisma.recordTypeGrant.createMany({
        data: seed.roles.flatMap((role) =>
          role.grants.map(([typeKey, actions]) => ({ companyId, typeId: id(typeKey), roleId: role.role.id, actions })),
        ),
      });
      const record = async (label: string, typeKey: string, data: { deletedAt?: Date } = {}) => {
        const recordId = randomUUID();
        await prisma.crmRecord.create({ data: { companyId, typeId: id(typeKey), id: recordId, ...data } });
        refs.push({ label, typeId: id(typeKey), recordId });
        return recordId;
      };
      const assign = (recordId: string, typeKey: string) =>
        prisma.recordAssignment.create({ data: { companyId, typeId: id(typeKey), recordId, userId: own.user.id } });
      const parent = (child: string, deal: string, deletedAt: Date | null = null) =>
        prisma.recordLink.create({
          data: {
            companyId,
            id: randomUUID(),
            relationId: id("lineItem.deal"),
            sourceTypeId: id("lineItem"),
            sourceId: child,
            targetTypeId: id("deal"),
            targetId: deal,
            deletedAt,
          },
        });
      const assignedDeal = await record("assigned deal", "deal");
      await assign(assignedDeal, "deal");
      const otherDeal = await record("unassigned deal", "deal");
      const trashedDeal = await record("trashed deal", "deal", { deletedAt: new Date() });
      await assign(trashedDeal, "deal");
      await record("contact", "contact");
      const assignedContact = await record("assigned contact", "contact");
      await assign(assignedContact, "contact");
      await parent(await record("line item of assigned deal", "lineItem"), assignedDeal);
      await parent(await record("line item of unassigned deal", "lineItem"), otherDeal);
      await parent(await record("line item of trashed deal", "lineItem"), trashedDeal);
      await parent(await record("line item with a removed parent link", "lineItem"), assignedDeal, new Date());
      const assignedOrphan = await record("assigned line item without parent", "lineItem");
      await assign(assignedOrphan, "lineItem");
    });

    const grants = await runWithTenant(admin, () => repo.getGrants());
    const mismatches: string[] = [];
    let compared = 0;
    for (const role of seed.roles) {
      const actor = { id: role.user.id, status: role.user.status, role: { ...role.role, permissions: [] } };
      const policy = recordAccessForActor({ actor, grants, model, records: repo, companyId, userId: role.user.id });
      const access = policy.access(model.types.map((type) => type.id));
      for (const ref of refs) {
        const scope = access.get(ref.typeId);
        if (!scope) throw new Error("Missing read scope");
        const stored = await runWithTenant(admin, () => repo.getRecordCompanyWide(ref, { includeTrash: true }));
        if (!stored) throw new Error("Missing record");
        const javascript = await runWithTenant(admin, () => policy.canRead(stored));
        const record = Prisma.raw('"parity_record"');
        const rows = await runWithoutTenant(() =>
          prisma.$queryRaw<Array<{ readable: boolean }>>(Prisma.sql`
            SELECT ${recordReadPredicate(companyId, scope, record)} AS readable FROM "CrmRecord" ${record}
            WHERE ${record}."companyId" = ${companyId} AND ${record}."typeId" = ${ref.typeId} AND ${record}.id = ${ref.recordId}`),
        );
        compared += 1;
        if (rows[0]?.readable !== javascript)
          mismatches.push(`${role.name} / ${ref.label}: canRead=${javascript} sql=${rows[0]?.readable}`);
      }
    }
    expect(compared).toBe(ROLES.length * refs.length);
    expect(mismatches).toEqual([]);
  });
});
