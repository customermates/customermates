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
const { getGetRolesApiInteractor } = await import("@/core/di");
const { manageRolesTool } = await import("@/features/mcp-tools/role.mcp-tools");
const read = await restRoute("/v1/roles/read");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const w = await createRestRouteWorkspace();
  cleanups.push(w.cleanup);
  const memberRole = w.member.role;
  if (!memberRole) throw new Error("The member has no role");
  const permission = await runWithoutTenant(() =>
    prisma.rolePermission.create({
      data: { companyId: w.companyId, roleId: memberRole.id, resource: "users", action: "readAll" },
      select: { id: true, resource: true, action: true },
    }),
  );
  await w.grant("deal", ["readAll"]);
  await w.grant("task", ["create"]);
  const member = { ...w.member, role: { ...memberRole, permissions: [permission] } };
  return { ...w, member, memberRoleId: memberRole.id, adminRoleId: w.admin.roleId ?? "" };
}

type Context = { role: { id: string; recordGrants?: Array<{ typeId: string }> } | null; types: Array<{ id: string }> };
type McpRead = { structuredContent?: { result: Context } };
const mcpRead = async (input: Parameters<typeof manageRolesTool.execute>[0]) =>
  (await manageRolesTool.execute(input)) as McpRead;

describeDatabase("role metadata visibility on PostgreSQL", () => {
  it("shows a member without role management only their own role and the lists they can read", async () => {
    const w = await workspace();
    const catalog = await postAs(w, w.member, read, {});
    expect(catalog.status).toBe(200);
    expect((catalog.body as Context).types.map(({ id }) => id)).toEqual([w.id("deal")]);
    expect((catalog.body as Context).role).toBeNull();

    const own = await postAs(w, w.member, read, { id: w.memberRoleId });
    expect(own.status).toBe(200);
    expect((own.body as Context).role?.recordGrants?.map(({ typeId }) => typeId)).toEqual([w.id("deal")]);
    expect((own.body as Context).types.map(({ id }) => id)).toEqual([w.id("deal")]);

    expect((await postAs(w, w.member, read, { id: w.adminRoleId })).status).toBe(404);
    expect((await postAs(w, w.member, read, { typeIds: [w.id("contact")] })).status).toBe(404);
    expect(JSON.stringify((await postAs(w, w.member, read, {})).body)).not.toContain(w.id("contact"));

    const roles = await w.as(w.member, () => getGetRolesApiInteractor().invoke({}));
    expect(roles.ok && roles.data.items.map(({ id }) => id)).toEqual([w.memberRoleId]);

    const mcp = await w.as(w.member, () => mcpRead({ action: "read" }));
    const mcpContext = mcp.structuredContent?.result;
    expect(mcpContext?.types.map(({ id }) => id)).toEqual([w.id("deal")]);
    const mcpOwn = await w.as(w.member, () => mcpRead({ action: "read", roleId: w.memberRoleId }));
    expect(mcpOwn.structuredContent?.result.role?.recordGrants?.map(({ typeId }) => typeId)).toEqual([w.id("deal")]);
    const mcpForeign = await w.as(w.member, () => mcpRead({ action: "read", roleId: w.adminRoleId }));
    expect(mcpForeign.structuredContent).toBeUndefined();
    expect(JSON.stringify(mcpForeign)).not.toContain(w.id("contact"));
  }, 180_000);

  it("shows an administrator every role and list", async () => {
    const w = await workspace();
    const catalog = await postAs(w, w.admin, read, {});
    expect(catalog.status).toBe(200);
    expect((catalog.body as Context).types.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["contact", "organization", "deal", "service", "task"].map(w.id)),
    );
    const member = await postAs(w, w.admin, read, { id: w.memberRoleId });
    expect((member.body as Context).role?.recordGrants?.map(({ typeId }) => typeId).sort()).toEqual(
      [w.id("deal"), w.id("task")].sort(),
    );
    expect((await postAs(w, w.admin, read, { id: w.adminRoleId })).status).toBe(200);
    expect((await postAs(w, w.admin, read, { id: randomUUID() })).status).toBe(404);

    const roles = await w.as(w.admin, () => getGetRolesApiInteractor().invoke({}));
    expect(roles.ok && roles.data.items.map(({ id }) => id).sort()).toEqual([w.adminRoleId, w.memberRoleId].sort());

    const mcp = await w.as(w.admin, () => mcpRead({ action: "read" }));
    expect(mcp.structuredContent?.result.types.map(({ id }) => id)).toContain(w.id("contact"));
  }, 180_000);
});
