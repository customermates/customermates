import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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

    hasPermission() {
      return Promise.resolve(true);
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

await import("../tool-registry");
const { listRecordsTool } = await import("../entity-generic.mcp-tools");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const ada = randomUUID();
const ben = randomUUID();
const deal = randomUUID();
const task = randomUUID();
let tenantUser: TenantUser;

function actingAs(grants: Array<[Resource, Action]>) {
  tenantUser = {
    ...createMockUserWithPermissions(grants.map(([resource, action]) => ({ resource, action }))),
    companyId: company,
    id: ada,
  };
}

async function listedDeal() {
  const result: unknown = await listRecordsTool.execute(
    listRecordsTool.inputSchema.parse({ entity: "deal", include: ["owners", "links"] }),
  );
  const { items } = (result as { structuredContent: { items: Record<string, unknown>[] } }).structuredContent;
  expect(items).toHaveLength(1);
  return items[0];
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("list_records include against a role's read access", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      for (const [id, firstName] of [
        [ada, "Ada"],
        [ben, "Ben"],
      ] as const) {
        await prisma.user.create({
          data: { id, companyId: company, email: `${id}@example.com`, firstName, lastName: "Tester", status: "active" },
        });
      }
      await prisma.deal.create({ data: { id: deal, companyId: company, name: "Rollout", totalValue: 1_000 } });
      await prisma.dealUser.create({ data: { companyId: company, dealId: deal, userId: ben } });
      await prisma.task.create({ data: { id: task, companyId: company, name: "Security review", type: "custom" } });
      await prisma.taskUser.create({ data: { companyId: company, taskId: task, userId: ben } });
      await prisma.taskDeal.create({ data: { companyId: company, taskId: task, dealId: deal } });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({ where: { companyId: company } });
      await prisma.company.deleteMany({ where: { id: company } });
    });
    await prisma.$disconnect();
  });

  it("leaves taskIds out for a role that cannot read tasks, instead of reporting that no task is linked", async () => {
    actingAs([
      [Resource.deals, Action.readAll],
      [Resource.users, Action.readAll],
    ]);

    const item = await listedDeal();

    expect(item).toEqual({ id: deal, name: "Rollout", totalValue: 1_000, totalQuantity: 0, userIds: [ben] });
    expect(item).not.toHaveProperty("taskIds");
  });

  it("lists the linked task for a role that reads every task", async () => {
    actingAs([
      [Resource.deals, Action.readAll],
      [Resource.tasks, Action.readAll],
      [Resource.users, Action.readAll],
    ]);

    expect(await listedDeal()).toEqual({
      id: deal,
      name: "Rollout",
      totalValue: 1_000,
      totalQuantity: 0,
      userIds: [ben],
      taskIds: [task],
    });
  });

  it("keeps taskIds, empty, for a role that reads only its own tasks and owns none linked to the deal", async () => {
    actingAs([
      [Resource.deals, Action.readAll],
      [Resource.tasks, Action.readOwn],
      [Resource.users, Action.readAll],
    ]);

    expect(await listedDeal()).toMatchObject({ userIds: [ben], taskIds: [] });
  });

  it("leaves userIds out for a role that cannot read users, instead of reporting that the deal has no owner", async () => {
    actingAs([
      [Resource.deals, Action.readAll],
      [Resource.tasks, Action.readAll],
    ]);

    const item = await listedDeal();

    expect(item).toEqual({ id: deal, name: "Rollout", totalValue: 1_000, totalQuantity: 0, taskIds: [task] });
    expect(item).not.toHaveProperty("userIds");
  });
});
