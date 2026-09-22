import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Action, CountryCode, Resource, Status } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));
vi.mock("@/features/user/user.service", () => ({
  UserService: class {
    getUserOrThrow() {
      return Promise.resolve(actingAdmin);
    }

    getActiveUserOrThrow() {
      return Promise.resolve(actingAdmin);
    }

    getActiveTenantUserOrThrow() {
      return Promise.resolve(actingAdmin);
    }

    hasPermissionForUser() {
      return true;
    }

    hasPermission() {
      return Promise.resolve(true);
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

const { getAdminUpdateUserDetailsInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const admin = randomUUID();
const teammate = randomUUID();
const systemRole = randomUUID();
const memberRole = randomUUID();
const routineA = randomUUID();
const routineB = randomUUID();

const teammateEmail = `teammate-${teammate}@example.com`;

const actingAdmin: TenantUser = createMockUser({
  id: admin,
  companyId: company,
  roleId: systemRole,
  role: {
    id: systemRole,
    name: "System",
    description: null,
    isSystemRole: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: [
      { id: "users-0", resource: Resource.users, action: Action.update },
      { id: "users-1", resource: Resource.users, action: Action.readAll },
    ],
  },
});

const seedRoutine = (id: string, name: string) => ({
  id,
  companyId: company,
  ownerUserId: teammate,
  name,
  prompt: "Summarise the open pipeline.",
  enabled: true,
  triggerKind: "schedule" as const,
  cronExpression: "0 9 * * *",
  timezone: "Europe/Berlin",
  nextRunAt: new Date("2026-12-01T08:00:00.000Z"),
});

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("deactivating a teammate and the routines it disables", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.userRole.createMany({
        data: [
          { id: systemRole, companyId: company, name: "System", isSystemRole: true },
          { id: memberRole, companyId: company, name: "Member", isSystemRole: false },
        ],
      });
      await prisma.user.createMany({
        data: [
          {
            id: admin,
            companyId: company,
            roleId: systemRole,
            email: `admin-${admin}@example.com`,
            firstName: "Ada",
            lastName: "Admin",
            status: Status.active,
          },
          {
            id: teammate,
            companyId: company,
            roleId: memberRole,
            email: teammateEmail,
            firstName: "Tom",
            lastName: "Teammate",
            status: Status.active,
          },
        ],
      });
      await prisma.subscription.create({ data: { companyId: company, plan: "enterprise", status: "active" } });
      await prisma.routine.createMany({
        data: [seedRoutine(routineA, "Daily digest"), seedRoutine(routineB, "Stale deal sweep")],
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.delete({ where: { id: company } }));
  });

  it("disables the routines and audits the deactivation that caused it, without a per-routine row", async () => {
    const result = await getAdminUpdateUserDetailsInteractor().invoke({
      email: teammateEmail,
      firstName: "Tom",
      lastName: "Teammate",
      country: CountryCode.de,
      status: Status.inactive,
      avatarUrl: null,
      roleId: memberRole,
    });

    expect(result.ok).toBe(true);

    const routines = await runWithoutTenant(() =>
      prisma.routine.findMany({ where: { companyId: company }, orderBy: { name: "asc" } }),
    );

    expect(routines.map((routine) => routine.enabled)).toEqual([false, false]);
    expect(routines.map((routine) => routine.disabledReason)).toEqual(["ownerUnavailable", "ownerUnavailable"]);
    expect(routines.map((routine) => routine.nextRunAt)).toEqual([null, null]);

    const rows = await runWithoutTenant(() => prisma.auditLog.findMany({ where: { companyId: company } }));

    expect(rows.map((row) => row.event)).toEqual(["user.updated"]);
    expect(rows[0].eventData).toMatchObject({ userId: admin, payload: { status: Status.inactive } });
  });
});
