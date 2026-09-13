import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
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
      return Promise.resolve(tenantUser);
    }

    getActiveUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    getActiveTenantUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    hasPermissionForUser() {
      return true;
    }

    hasPermission(resource: Resource, action: Action) {
      return Promise.resolve(
        (tenantUser.role?.permissions ?? []).some((p) => p.resource === resource && p.action === action),
      );
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

const { getUpsertRoutineInteractor, getDeleteRoutineInteractor, getPauseRoutineInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const actor = randomUUID();
const role = randomUUID();

const ROUTINE_ACTIONS = [Action.create, Action.update, Action.delete, Action.readAll, Action.readOwn] as const;

const tenantUser: TenantUser = createMockUser({
  id: actor,
  companyId: company,
  roleId: role,
  role: {
    id: role,
    name: "System",
    description: null,
    isSystemRole: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: ROUTINE_ACTIONS.map((action, index) => ({
      id: `routines-${index}`,
      resource: Resource.routines,
      action,
    })),
  },
});

const newRoutine = {
  name: "Daily deal digest",
  prompt: "Summarise the open pipeline.",
  triggerKind: "schedule" as const,
  cronExpression: "0 9 * * *",
  timezone: "Europe/Berlin",
};

const auditRows = () =>
  runWithoutTenant(() => prisma.auditLog.findMany({ where: { companyId: company }, orderBy: { createdAt: "asc" } }));

const createRoutine = async () => {
  const result = await getUpsertRoutineInteractor().invoke(newRoutine);
  if (!result.ok) throw new Error("Expected the routine to be created");

  return result.data;
};

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("a routine change leaves an audit trail in a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.userRole.create({ data: { id: role, companyId: company, name: "System", isSystemRole: true } });
      await prisma.user.create({
        data: {
          id: actor,
          companyId: company,
          roleId: role,
          email: `routine-audit-${actor}@example.com`,
          firstName: "Routine",
          lastName: "Owner",
          status: "active",
        },
      });
      await prisma.subscription.create({ data: { companyId: company, plan: "enterprise", status: "active" } });
    });
  });

  beforeEach(async () => {
    await runWithoutTenant(async () => {
      await prisma.routine.deleteMany({ where: { companyId: company } });
      await prisma.auditLog.deleteMany({ where: { companyId: company } });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.delete({ where: { id: company } });
    });
  });

  it("writes one routine.created row naming the actor and the routine", async () => {
    const routine = await createRoutine();
    const rows = await auditRows();

    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe("routine.created");
    expect(rows[0].userId).toBe(actor);
    expect(rows[0].companyId).toBe(company);
    expect(rows[0].entityId).toBe(routine.id);
    expect(rows[0].eventData).toMatchObject({
      entityId: routine.id,
      userId: actor,
      companyId: company,
      payload: { id: routine.id, name: "Daily deal digest", ownerUserId: actor, triggerKind: "schedule" },
    });
  });

  it("writes a routine.updated row carrying the previous and current instruction", async () => {
    const routine = await createRoutine();

    const updated = await getUpsertRoutineInteractor().invoke({
      id: routine.id,
      prompt: "Summarise the open pipeline and flag stalled deals.",
    });

    expect(updated.ok).toBe(true);

    const rows = await auditRows();
    const update = rows.find((row) => row.event === "routine.updated");

    expect(rows).toHaveLength(2);
    expect(update?.entityId).toBe(routine.id);
    expect(update?.eventData).toMatchObject({
      payload: {
        routine: { id: routine.id },
        changes: {
          prompt: {
            previous: "Summarise the open pipeline.",
            current: "Summarise the open pipeline and flag stalled deals.",
          },
        },
      },
    });
  });

  it("writes no row for a save that changes nothing", async () => {
    await createRoutine();

    const unchanged = await getUpsertRoutineInteractor().invoke({ ...newRoutine, id: (await auditRows())[0].entityId });

    expect(unchanged.ok).toBe(true);
    expect(await auditRows()).toHaveLength(1);
  });

  it("writes a routine.updated row when an administrator pauses a routine", async () => {
    const routine = await createRoutine();

    const paused = await getPauseRoutineInteractor().invoke({ routineId: routine.id });

    expect(paused.ok).toBe(true);

    const rows = await auditRows();
    const update = rows.find((row) => row.event === "routine.updated");

    expect(update?.eventData).toMatchObject({
      payload: { changes: { enabled: { previous: true, current: false } } },
    });
  });

  it("keeps the routine.deleted row after the routine and its runs are gone", async () => {
    const routine = await createRoutine();

    const deleted = await getDeleteRoutineInteractor().invoke({ id: routine.id });

    expect(deleted.ok).toBe(true);

    const rows = await auditRows();
    const remaining = await runWithoutTenant(() => prisma.routine.count({ where: { id: routine.id } }));

    expect(remaining).toBe(0);
    expect(rows.map((row) => row.event)).toEqual(["routine.created", "routine.deleted"]);
    expect(rows[1].entityId).toBe(routine.id);
    expect(rows[1].eventData).toMatchObject({ payload: { id: routine.id, name: "Daily deal digest" } });
  });
});
