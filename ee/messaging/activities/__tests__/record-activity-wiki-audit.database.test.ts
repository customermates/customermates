import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";
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
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { createCrmPreset } = await import("@/features/records/crm-preset");
const { PrismaRecordActivitiesRepo } = await import("@/ee/messaging/activities/prisma-record-activities.repository");
const { RecordActivitiesInputSchema } = await import("@/ee/messaging/activities/record-activities.schema");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("Knowledge Base audit entries in workspace activity", () => {
  it("shows Knowledge Base page changes only to audit viewers who can read the Knowledge Base", async () => {
    const seed = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      companies.push(company.id);
      const adminRole = await prisma.userRole.create({
        data: { companyId: company.id, name: "Administrator", isSystemRole: true },
      });
      const auditRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Auditor" } });
      const [admin, auditor] = await Promise.all(
        [adminRole, auditRole].map((role) =>
          prisma.user.create({
            data: {
              companyId: company.id,
              roleId: role.id,
              firstName: "Audit",
              lastName: "Test",
              email: `${randomUUID()}@example.test`,
              status: "active",
            },
          }),
        ),
      );
      await prisma.rolePermission.create({
        data: { companyId: company.id, roleId: auditRole.id, resource: Resource.auditLog, action: Action.readAll },
      });
      const wikiEntry = await prisma.eventLog.create({
        data: {
          companyId: company.id,
          actorId: admin.id,
          subjectId: randomUUID(),
          subjectKind: "wiki_page",
          kind: DomainEvent.WIKI_PAGE_CREATED,
          payload: { title: "Refund policy" },
        },
      });
      const companyEntry = await prisma.eventLog.create({
        data: {
          companyId: company.id,
          actorId: admin.id,
          subjectId: company.id,
          subjectKind: "company",
          kind: DomainEvent.COMPANY_UPDATED,
          payload: {},
        },
      });
      return { company, adminRole, auditRole, admin, auditor, wikiEntry, companyEntry };
    });
    const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
    const repo = new PrismaRecordRepo();
    await runWithTenant(admin, () =>
      runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id, "EUR"), admin.id), { timeout: 30000 }),
    );
    const auditor = (wiki: boolean) =>
      createMockUser({
        ...seed.auditor,
        role: {
          ...seed.auditRole,
          permissions: [
            { id: randomUUID(), resource: Resource.auditLog, action: Action.readAll },
            ...(wiki ? [{ id: randomUUID(), resource: Resource.wiki, action: Action.readAll }] : []),
          ],
        },
      });
    const input = RecordActivitiesInputSchema.parse({ scope: { records: [], typeIds: [] }, kinds: ["audit"] });
    const visibleAudit = async (wiki: boolean) =>
      runWithTenant(auditor(wiki), () =>
        runInTransaction(async () => {
          const policy = await new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo).load();
          const model = await repo.getModel();
          const activities = new PrismaRecordActivitiesRepo(new PermissionService());
          const index = await activities.index(input, model, policy.access(model.types.map((type) => type.id)), [
            "audit",
          ]);
          const ids = index.filter((row) => row.kind === "audit").map((row) => row.id);
          const loaded = await activities.eventsCompanyWide(ids.length ? ids : [seed.wikiEntry.id]);
          return { ids, loaded: loaded.map((row) => row.id) };
        }),
      );

    const withoutWiki = await visibleAudit(false);
    expect(withoutWiki.ids).toContain(seed.companyEntry.id);
    expect(withoutWiki.ids).not.toContain(seed.wikiEntry.id);
    expect(withoutWiki.loaded).not.toContain(seed.wikiEntry.id);

    const withWiki = await visibleAudit(true);
    expect(withWiki.ids).toEqual(expect.arrayContaining([seed.companyEntry.id, seed.wikiEntry.id]));
    expect(withWiki.loaded).toContain(seed.wikiEntry.id);
  }, 120_000);
});
