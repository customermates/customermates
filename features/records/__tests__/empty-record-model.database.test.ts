import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const {
  getAdminUpdateUserDetailsInteractor,
  getApplyRecordConfigurationInteractor,
  getCountSystemTasksInteractor,
  getEventService,
  getUpdateUserDetailsInteractor,
  getUpsertRecordActivityWidgetInteractor,
  getUpsertRoleInteractor,
} = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { RegisterUserInteractor } = await import("@/features/user/register/register-user.interactor");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { createTestWorkspaceRegistration } = await import("@/tests/helpers/workspace-registration");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const company = randomUUID();
const ownerId = randomUUID();
const adminRole = randomUUID();
const memberRole = randomUUID();
const memberEmail = `empty-model-member-${company}@example.com`;
const authUserId = `auth-${company}`;

const owner: TenantUser = createMockUser({
  id: ownerId,
  email: `empty-model-owner-${company}@example.com`,
  companyId: company,
  roleId: adminRole,
  role: {
    id: adminRole,
    name: "Admin",
    description: null,
    isSystemRole: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: [],
  },
});

const asOwner = <T>(work: () => Promise<T>) => runWithTenant(owner, work);
const state = () => asOwner(() => createTestRecordRepo().getState());
const membershipTasks = () =>
  runWithoutTenant(() =>
    prisma.crmRecord.count({ where: { companyId: company, protectedKind: "membershipAuthorization" } }),
  );

describeDatabase("a workspace without a record model", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.userRole.createMany({
        data: [
          { id: adminRole, companyId: company, name: "Admin", isSystemRole: true },
          { id: memberRole, companyId: company, name: "Member", isSystemRole: false },
        ],
      });
      await prisma.user.create({
        data: {
          id: ownerId,
          companyId: company,
          roleId: adminRole,
          email: owner.email,
          firstName: "Olga",
          lastName: "Owner",
          status: Status.active,
        },
      });
      await prisma.subscription.create({ data: { companyId: company, plan: "enterprise", status: "active" } });
      await prisma.authUser.create({ data: { id: authUserId, name: "Pending Member", email: memberEmail } });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.authUser.deleteMany({ where: { id: authUserId } });
      await prisma.company.deleteMany({ where: { id: company } });
    });
  });

  it("starts at revision 0 with no lists", async () => {
    expect(await state()).toBeNull();
    expect(await asOwner(() => createTestRecordRepo().getModel())).toMatchObject({ revision: 0, types: [] });
  });

  it("adds an activity widget to the empty dashboard at revision 0", async () => {
    const saved = await asOwner(() =>
      getUpsertRecordActivityWidgetInteractor().invoke({
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
        name: "Activity",
        activityQuery: { scope: { records: [], typeIds: [] }, kinds: ["audit"] },
      }),
    );
    expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, data: { schemaRevision: 0 } });
  });

  it("edits the owner's profile without a membership list", async () => {
    const updated = await asOwner(() =>
      getUpdateUserDetailsInteractor().invoke({ firstName: "Olivia", country: "at" }),
    );
    expect(updated, JSON.stringify(updated)).toMatchObject({ ok: true, data: { firstName: "Olivia", country: "at" } });
  });

  it("registers an invited member as pending without creating an approval task", async () => {
    const register = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      new PrismaUserRepo(new PermissionService()),
      getEventService(),
      {
        resolveAccountState: () =>
          Promise.resolve({ state: "unregistered", sessionUser: { id: authUserId, email: memberEmail } }),
      } as never,
      new PrismaCompanyRepo(),
      createTestWorkspaceRegistration(),
    );
    const result = await register.invoke(
      {
        email: memberEmail,
        firstName: "Pending",
        lastName: "Member",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "invitation", companyId: company } },
    );
    expect(result, JSON.stringify(result)).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
    expect(
      await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })),
    ).toMatchObject({
      status: Status.pendingAuthorization,
    });
    expect(await membershipTasks()).toBe(0);
    expect(await asOwner(() => getCountSystemTasksInteractor().invoke())).toMatchObject({ ok: true, data: 0 });
  });

  it("approves the pending member in Members", async () => {
    const member = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { email: memberEmail } }));
    const approved = await asOwner(() =>
      getAdminUpdateUserDetailsInteractor().invoke({ userId: member.id, status: Status.active, roleId: memberRole }),
    );
    expect(approved, JSON.stringify(approved)).toMatchObject({ ok: true, data: { status: Status.active } });
    expect(await membershipTasks()).toBe(0);
  });

  it("creates a role at revision 0 and stores an empty first revision", async () => {
    const created = await asOwner(() =>
      getUpsertRoleInteractor().invoke({
        name: "Sales",
        description: "Sales team",
        permissions: [],
        recordGrants: [],
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
      }),
    );
    expect(created, JSON.stringify(created)).toMatchObject({ ok: true, data: { schemaRevision: 1 } });
    expect(await state()).toMatchObject({ revision: 1 });
    expect(await asOwner(() => createTestRecordRepo().getModel())).toMatchObject({ revision: 1, types: [] });
  });

  it("lets an admin designate the first membership list once and refuses a second one", async () => {
    const configure = (revision: number, operations: unknown[]) =>
      asOwner(() =>
        getApplyRecordConfigurationInteractor().invoke({
          expectedRevision: revision,
          idempotencyKey: randomUUID(),
          operations,
        } as never),
      );
    const list = (reference: string, label: string) => ({
      operation: "createType",
      reference,
      label,
      pluralLabel: `${label}s`,
      description: "",
      icon: "list",
      embedded: false,
      accessPresetId: null,
    });
    const membership = (id: string, typeId: string) => ({
      operation: "putCapability",
      capability: { id, kind: "membershipAuthorization", typeId, fields: [] },
    });
    const refused = {
      ok: false,
      error: { issues: [expect.objectContaining({ params: expect.objectContaining({ error: "recordProtected" }) })] },
    };

    expect(
      await configure(1, [
        list("$list.todo", "To-do"),
        list("$list.chore", "Chore"),
        membership("$cap.first", "$list.todo"),
        membership("$cap.second", "$list.chore"),
      ]),
    ).toMatchObject(refused);
    expect(
      await configure(1, [
        list("$list.todo", "To-do"),
        list("$list.chore", "Chore"),
        membership("$cap.first", "$list.todo"),
      ]),
    ).toMatchObject({ ok: true, data: { schemaRevision: 2 } });
    const model = await asOwner(() => createTestRecordRepo().getModel());
    const host = model.capabilities.find((binding) => binding.kind === "membershipAuthorization");
    const chore = model.types.find((type) => type.label === "Chore");
    expect(model.types.find((type) => type.id === host?.typeId)?.label).toBe("To-do");
    expect(await configure(2, [membership(randomUUID(), chore?.id ?? "")])).toMatchObject(refused);

    const member = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { email: memberEmail } }));
    expect(await membershipTasks()).toBe(0);
    expect(
      await asOwner(() => getAdminUpdateUserDetailsInteractor().invoke({ userId: member.id, status: Status.inactive })),
    ).toMatchObject({ ok: true });
  });
});
