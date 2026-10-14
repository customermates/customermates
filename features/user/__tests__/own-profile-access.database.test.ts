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

const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { ForbiddenError } = await import("@/core/errors/app-errors");
const { GET: readOwnProfile } = await import("@/app/api/v1/users/me/route");
const { getGetUserByIdInteractor, getGetUserDetailsInteractor, getGetUsersInteractor, getUpdateUserDetailsInteractor } =
  await import("@/core/di");

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

describeDatabase("own profile for a member without Users & Roles access on PostgreSQL", () => {
  it("loads the member's own profile in the app and over REST", async () => {
    const w = await workspace();
    expect(w.member.role?.permissions).toEqual([]);

    const profile = await w.as(w.member, () => getGetUserDetailsInteractor().invoke());
    expect(profile).toMatchObject({
      ok: true,
      data: { id: w.member.id, firstName: "Member", lastName: "Test", roleName: "Member", roleIsSystemRole: false },
    });

    const response = await w.as(w.member, () => readOwnProfile());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: w.member.id, email: w.member.email });
  }, 180_000);

  it("saves the member's own profile and leaves every other member untouched", async () => {
    const w = await workspace();

    const saved = await w.as(w.member, () =>
      getUpdateUserDetailsInteractor().invoke({ firstName: "Renamed", theme: "dark", displayLanguage: "de" }),
    );
    expect(saved, JSON.stringify(saved)).toMatchObject({
      ok: true,
      data: { firstName: "Renamed", lastName: "Test", theme: "dark", displayLanguage: "de" },
    });

    const rows = await runWithoutTenant(() =>
      prisma.user.findMany({
        where: { companyId: w.companyId },
        select: { id: true, firstName: true, theme: true },
      }),
    );
    expect(new Map(rows.map(({ id, ...row }) => [id, row]))).toEqual(
      new Map([
        [w.member.id, { firstName: "Renamed", theme: "dark" }],
        [w.admin.id, { firstName: "Admin", theme: w.admin.theme }],
      ]),
    );
  }, 180_000);

  it("still refuses that member another member's details and the member list", async () => {
    const w = await workspace();

    await expect(w.as(w.member, () => getGetUserByIdInteractor().invoke({ id: w.admin.id }))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(w.as(w.member, () => getGetUsersInteractor().invoke({}))).rejects.toThrow("read on users");
  }, 180_000);
});
