import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
      return Promise.resolve(tenantUser);
    }

    getActiveUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    hasPermission() {
      return Promise.resolve(true);
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

await import("@/core/di");
const { manageRoutinesTool } = await import("../routine.mcp-tools");
const { mcpToolResultText } = await import("../mcp-tool");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const user = randomUUID();
const role = randomUUID();
const tenantUser = createMockUser({ companyId: company, id: user });

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

type ToolResult = { structuredContent?: Record<string, unknown> };

async function run(params: Record<string, unknown>) {
  const result = await manageRoutinesTool.execute(params as never);
  return { text: mcpToolResultText(result), structured: (result as ToolResult).structuredContent ?? {} };
}

describeDatabase("manage_routines against a real database", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.subscription.create({
        data: { companyId: company, status: "active", plan: "enterprise" },
      });
      await prisma.userRole.create({
        data: { id: role, companyId: company, name: "Admin", description: "Full access", isSystemRole: true },
      });
      await prisma.user.create({
        data: {
          id: user,
          companyId: company,
          roleId: role,
          email: `routines-${user}@example.com`,
          firstName: "Routine",
          lastName: "Tester",
          status: "active",
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.routine.deleteMany({ where: { companyId: company } });
      await prisma.subscription.deleteMany({ where: { companyId: company } });
      await prisma.user.deleteMany({ where: { companyId: company } });
      await prisma.userRole.deleteMany({ where: { companyId: company } });
      await prisma.company.deleteMany({ where: { id: company } });
    });
    await prisma.$disconnect();
  });

  it("creates a draft, renames it, reads its runs and deletes it", async () => {
    const created = await run({
      action: "create",
      name: "MCP probe routine",
      prompt: "Summarise the open pipeline. Change nothing.",
      triggerKind: "schedule",
      cronExpression: "0 9 * * 1",
      timezone: "Europe/Berlin",
      enabled: false,
    });
    const id = created.structured.id as string;

    expect(id).toEqual(expect.any(String));
    expect(created.structured).toMatchObject({ name: "MCP probe routine", enabled: false });

    const listed = await run({ action: "list" });
    expect(listed.text).toContain("MCP probe routine");

    const renamed = await run({ action: "update", id, name: "MCP probe renamed" });
    expect(renamed.structured).toMatchObject({ name: "MCP probe renamed" });

    const runs = await run({ action: "runs", id });
    expect(runs.structured).toMatchObject({ nextCursor: null });

    const deleted = await run({ action: "delete", id });
    expect(deleted.structured).toMatchObject({ deleted: true, id });

    const gone = await runWithoutTenant(() => prisma.routine.findUnique({ where: { id }, select: { id: true } }));
    expect(gone).toBeNull();
  });

  it("creates a live routine when enabled is omitted, which the description warns about", async () => {
    const created = await run({
      action: "create",
      name: "MCP live probe",
      prompt: "Summarise the open pipeline. Change nothing.",
      triggerKind: "schedule",
      cronExpression: "0 10 * * 1",
      timezone: "Europe/Berlin",
    });

    expect(created.structured).toMatchObject({ enabled: true });
    await run({ action: "delete", id: created.structured.id as string });
  });

  it("rejects an update without an id instead of creating a new routine", async () => {
    const before = await runWithoutTenant(() => prisma.routine.count({ where: { companyId: company } }));
    const result = await run({
      action: "update",
      name: "Must not be created",
      prompt: "Change nothing.",
      triggerKind: "schedule",
      cronExpression: "0 9 * * 1",
      timezone: "Europe/Berlin",
      enabled: false,
    });

    expect(result.structured).not.toHaveProperty("id");
    expect(await runWithoutTenant(() => prisma.routine.count({ where: { companyId: company } }))).toBe(before);
  });

  it("refuses a schedule tighter than the interval floor", async () => {
    const result = await run({
      action: "create",
      name: "MCP too frequent",
      prompt: "Summarise the open pipeline. Change nothing.",
      triggerKind: "schedule",
      cronExpression: "* * * * *",
      timezone: "Europe/Berlin",
      enabled: false,
    });

    expect(result.text.toLowerCase()).toContain("minute");
    expect(await runWithoutTenant(() => prisma.routine.count({ where: { companyId: company } }))).toBe(0);
  });

  it("refuses to delete for a caller who is not an active system administrator", async () => {
    const created = await run({
      action: "create",
      name: "MCP admin gate probe",
      prompt: "Summarise the open pipeline. Change nothing.",
      triggerKind: "schedule",
      cronExpression: "0 11 * * 1",
      timezone: "Europe/Berlin",
      enabled: false,
    });
    const id = created.structured.id as string;

    await runWithoutTenant(() => prisma.userRole.update({ where: { id: role }, data: { isSystemRole: false } }));
    const refused = await run({ action: "delete", id });
    await runWithoutTenant(() => prisma.userRole.update({ where: { id: role }, data: { isSystemRole: true } }));

    expect(refused.structured).not.toMatchObject({ deleted: true });
    expect(await runWithoutTenant(() => prisma.routine.count({ where: { id } }))).toBe(1);

    await run({ action: "delete", id });
  });
});
