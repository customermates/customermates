import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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

const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { getGetCompanyInteractor } = await import("@/core/di");
const { manageRolesTool } = await import("@/features/mcp-tools/role.mcp-tools");
const save = await restRoute("/v1/roles/save");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const w = await createRestRouteWorkspace();
  cleanups.push(w.cleanup);
  return w;
}

const IMPLICIT_ROWS = ["company:readAll", "company:readOwn", "dataModel:readAll", "dataModel:readOwn"];

async function storedRows(roleId: string) {
  const rows = await runWithoutTenant(() =>
    prisma.rolePermission.findMany({ where: { roleId }, select: { resource: true, action: true } }),
  );
  return rows.map(({ resource, action }) => `${resource}:${action}`).sort();
}

describeDatabase("implicit company and data model reads on PostgreSQL", () => {
  it("stores the implicit read rows for a role saved over REST or MCP without listing them", async () => {
    const w = await workspace();
    const rest = await postAs(w, w.admin, save, {
      name: `REST ${randomUUID()}`,
      description: "Limited",
      permissions: [{ resource: "api", actions: ["readAll"] }],
      recordGrants: [{ typeId: w.id("deal"), actions: ["readAll"] }],
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
    });
    expect(rest.status).toBe(200);
    const restRoleId = (rest.body as { role: { id: string } }).role.id;
    expect(await storedRows(restRoleId)).toEqual(["api:readAll", ...IMPLICIT_ROWS].sort());

    const mcp = await w.as(w.admin, async () =>
      manageRolesTool.execute({
        action: "save",
        role: {
          name: `MCP ${randomUUID()}`,
          description: "Limited",
          permissions: [{ resource: "company", actions: [] }],
          recordGrants: [],
          expectedRevision: await w.revision(),
          idempotencyKey: randomUUID(),
        },
      }),
    );
    const mcpRoleId = (mcp as { structuredContent?: { result: { role: { id: string } } } }).structuredContent?.result
      .role.id;
    expect(mcpRoleId).toBeDefined();
    expect(await storedRows(mcpRoleId ?? "")).toEqual(IMPLICIT_ROWS);
  }, 180_000);

  it("lets a member whose role predates the implicit rows load the company shell", async () => {
    const w = await workspace();
    const memberRoleId = w.member.role?.id ?? "";
    expect(await storedRows(memberRoleId)).toEqual([]);

    const company = await w.as(w.member, () => getGetCompanyInteractor().invoke());
    expect(company.ok).toBe(true);
  }, 180_000);
});
