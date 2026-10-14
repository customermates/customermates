import type { Prisma } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

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
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordIdentityReader } = await import("@/features/records/record-identity-reader");
const { RecordHistoryReader } = await import("@/features/records/record-history-reader");
const { createCrmPreset } = await import("@/features/records/crm-preset");
const { PrismaRecordActivitiesRepo } = await import("@/ee/messaging/activities/prisma-record-activities.repository");
const { GetRecordActivitiesInteractor } = await import("@/ee/messaging/activities/get-record-activities.interactor");
const { RecordActivitiesInputSchema } = await import("@/ee/messaging/activities/record-activities.schema");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("workspace activity subjects", () => {
  it("names the member or role an admin entry changed, from stored labels once the role is gone", async () => {
    const seed = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      companies.push(company.id);
      const adminRole = await prisma.userRole.create({
        data: { companyId: company.id, name: "Administrator", isSystemRole: true },
      });
      const fieldRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Field team" } });
      const admin = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: adminRole.id,
          firstName: "Olivia",
          lastName: "Owner",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
      const member = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: fieldRole.id,
          firstName: "Invited",
          lastName: "Member",
          email: `${randomUUID()}@example.test`,
          status: "active",
          avatarUrl: "https://example.test/member.png",
        },
      });
      const formerMemberId = randomUUID();
      const retiredRoleId = randomUUID();
      const log = (kind: DomainEvent, subjectKind: string, subjectId: string, payload: Prisma.InputJsonObject) =>
        prisma.eventLog.create({
          data: { companyId: company.id, actorId: admin.id, subjectKind, subjectId, kind, payload },
        });
      const statusChange = await log(DomainEvent.USER_UPDATED, "user", member.id, {
        changes: { status: { previous: "inactive", current: "active" } },
      });
      const formerMember = await log(DomainEvent.USER_UPDATED, "user", formerMemberId, {
        changes: { status: { previous: "active", current: "inactive" } },
      });
      const roleChange = await log(DomainEvent.ROLE_UPDATED, "role", fieldRole.id, {
        role: { id: fieldRole.id, name: "Field team", permissions: [] },
        changes: { description: { previous: null, current: "Visits customers" } },
      });
      const retiredRole = await log(DomainEvent.ROLE_DELETED, "role", retiredRoleId, {
        id: retiredRoleId,
        name: "Retired role",
        permissions: [],
      });
      return {
        company,
        adminRole,
        admin,
        member,
        fieldRole,
        formerMemberId,
        retiredRoleId,
        statusChange,
        formerMember,
        roleChange,
        retiredRole,
      };
    });
    const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
    const repo = createTestRecordRepo();
    await runWithTenant(admin, () =>
      runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
    );
    const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
    const activities = new GetRecordActivitiesInteractor(
      new PrismaRecordActivitiesRepo(new PermissionService()),
      repo,
      policy,
      new RecordIdentityReader(repo, policy),
      new RecordHistoryReader(repo),
      { require: () => Promise.resolve(null) },
      { find: () => Promise.resolve(null) },
    );

    const result = await runWithTenant(admin, () =>
      activities.invoke(
        RecordActivitiesInputSchema.parse({ scope: { records: [], typeIds: [] }, kinds: ["audit"], limit: 100 }),
      ),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const entry = (id: string) => result.data.items.find((item) => item.id === id);

    expect(entry(seed.statusChange.id)).toMatchObject({
      kind: "audit",
      actor: { firstName: "Olivia", lastName: "Owner" },
      changes: [{ field: "status", previous: "inactive", current: "active" }],
      subject: {
        kind: "user",
        member: {
          id: seed.member.id,
          firstName: "Invited",
          lastName: "Member",
          avatarUrl: "https://example.test/member.png",
        },
      },
    });
    expect(entry(seed.formerMember.id)).toMatchObject({
      subject: { kind: "user", member: { id: seed.formerMemberId, firstName: "", lastName: "", avatarUrl: null } },
    });
    expect(entry(seed.roleChange.id)).toMatchObject({
      subject: { kind: "role", id: seed.fieldRole.id, label: "Field team" },
    });
    expect(entry(seed.retiredRole.id)).toMatchObject({
      subject: { kind: "role", id: seed.retiredRoleId, label: "Retired role" },
    });
  }, 120_000);
});
