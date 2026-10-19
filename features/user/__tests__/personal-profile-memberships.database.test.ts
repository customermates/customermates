import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
const { createMockUser } = await import("@/tests/helpers/mock-user");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { getAdminUpdateUserDetailsInteractor, getUpdateUserDetailsInteractor } = await import("@/core/di");
const { AuthService } = await import("@/features/auth/auth.service");

const interactiveSession = vi.spyOn(AuthService.prototype, "getInteractiveSession");

function signedInInBrowser(email: string) {
  interactiveSession.mockResolvedValue({ user: { email } } as never);
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

const PROFILE_SELECT = {
  firstName: true,
  lastName: true,
  avatarUrl: true,
  theme: true,
  displayLanguage: true,
  formattingLocale: true,
} as const;

async function sharedLogin() {
  const home = await createRestRouteWorkspace();
  const other = await createRestRouteWorkspace();
  cleanups.push(home.cleanup, other.cleanup);

  const membership = await runWithoutTenant(() =>
    prisma.user.create({
      data: {
        id: randomUUID(),
        companyId: other.companyId,
        email: home.member.email,
        firstName: "Member",
        lastName: "Test",
        status: "active",
        roleId: other.member.roleId,
        theme: "system",
      },
    }),
  );

  return { home, other, membership };
}

function profiles(ids: string[]) {
  return runWithoutTenant(() =>
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, ...PROFILE_SELECT } }),
  ).then((rows) => new Map(rows.map(({ id, ...profile }) => [id, profile])));
}

describeDatabase("personal profile across the workspaces of one login on PostgreSQL", () => {
  beforeEach(() => {
    interactiveSession.mockResolvedValue(null);
  });

  it("applies an own profile edit to every membership of the login and to nobody else", async () => {
    const { home, other, membership } = await sharedLogin();
    signedInInBrowser(home.member.email);

    const saved = await home.as(home.member, () =>
      getUpdateUserDetailsInteractor().invoke({
        firstName: "Renamed",
        lastName: "Person",
        avatarUrl: "https://example.com/avatar.png",
        theme: "dark",
        displayLanguage: "de",
        formattingLocale: "fr",
      }),
    );
    expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true });

    const expected = {
      firstName: "Renamed",
      lastName: "Person",
      avatarUrl: "https://example.com/avatar.png",
      theme: "dark",
      displayLanguage: "de",
      formattingLocale: "fr",
    };
    const rows = await profiles([home.member.id, membership.id, home.admin.id, other.member.id, other.admin.id]);
    expect(rows.get(home.member.id)).toEqual(expected);
    expect(rows.get(membership.id)).toEqual(expected);
    for (const untouched of [home.admin, other.member, other.admin])
      expect(rows.get(untouched.id)?.firstName, untouched.id).not.toBe("Renamed");
  }, 180_000);

  it("keeps an edit made with an API key or MCP connection in the workspace of that credential", async () => {
    const { home, membership } = await sharedLogin();

    const saved = await home.as(home.member, () =>
      getUpdateUserDetailsInteractor().invoke({
        firstName: "Integration",
        avatarUrl: "https://example.com/integration.png",
        theme: "dark",
      }),
    );
    expect(saved).toMatchObject({ ok: true });

    const rows = await profiles([home.member.id, membership.id]);
    expect(rows.get(home.member.id)).toMatchObject({
      firstName: "Integration",
      avatarUrl: "https://example.com/integration.png",
      theme: "dark",
    });
    expect(rows.get(membership.id)).toMatchObject({ firstName: "Member", avatarUrl: null, theme: "system" });
  }, 180_000);

  it("carries a single preference change over without touching the other membership's name", async () => {
    const { home, membership } = await sharedLogin();
    signedInInBrowser(home.member.email);
    await runWithoutTenant(() =>
      prisma.user.update({ where: { id: membership.id }, data: { firstName: "Named by admin" } }),
    );

    const saved = await home.as(home.member, () => getUpdateUserDetailsInteractor().invoke({ theme: "light" }));
    expect(saved).toMatchObject({ ok: true });

    const rows = await profiles([home.member.id, membership.id]);
    expect(rows.get(membership.id)).toMatchObject({ theme: "light", firstName: "Named by admin" });
    expect(rows.get(home.member.id)).toMatchObject({ theme: "light", firstName: "Member" });
  }, 180_000);

  it("leaves the profile in a workspace the person left untouched", async () => {
    const { home, membership } = await sharedLogin();
    signedInInBrowser(home.member.email);
    await runWithoutTenant(() =>
      prisma.user.update({ where: { id: membership.id }, data: { status: "inactive", leftAt: new Date() } }),
    );

    const saved = await home.as(home.member, () =>
      getUpdateUserDetailsInteractor().invoke({ firstName: "After leaving", theme: "dark" }),
    );
    expect(saved).toMatchObject({ ok: true });

    const rows = await profiles([home.member.id, membership.id]);
    expect(rows.get(home.member.id)).toMatchObject({ firstName: "After leaving", theme: "dark" });
    expect(rows.get(membership.id)).toMatchObject({ firstName: "Member", theme: "system" });
  }, 180_000);

  it("keeps an administrator's edit of another member inside the administrator's workspace", async () => {
    const { home, other, membership } = await sharedLogin();
    const otherAdmin = createMockUser({
      ...other.admin,
      role: other.admin.role,
    });

    const result = await other.as(otherAdmin, () =>
      getAdminUpdateUserDetailsInteractor().invoke({ userId: membership.id, firstName: "Set by admin" }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });

    const rows = await profiles([home.member.id, membership.id]);
    expect(rows.get(membership.id)?.firstName).toBe("Set by admin");
    expect(rows.get(home.member.id)?.firstName).toBe("Member");
  }, 180_000);
});
