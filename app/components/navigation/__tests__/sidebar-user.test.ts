import { describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { sidebarUserCanAccess, toSidebarUser, type SidebarUser } from "../sidebar-user";

function sidebarUser(overrides: Partial<SidebarUser> = {}): SidebarUser {
  return {
    avatarUrl: null,
    email: "person@example.com",
    firstName: "Test",
    lastName: "Person",
    role: null,
    ...overrides,
  };
}

describe("sidebar user access", () => {
  it("gives a system role access to every sidebar destination", () => {
    const user = sidebarUser({ role: { isSystemRole: true, permissions: [] } });

    expect(sidebarUserCanAccess(user, Resource.routines)).toBe(true);
  });

  it.each([Action.readOwn, Action.readAll])("shows a resource with %s permission", (action) => {
    const user = sidebarUser({
      role: {
        isSystemRole: false,
        permissions: [{ action, resource: Resource.routines }],
      },
    });

    expect(sidebarUserCanAccess(user, Resource.routines)).toBe(true);
    expect(sidebarUserCanAccess(user, Resource.wiki)).toBe(false);
  });

  it("projects only account-menu identity and role permissions from the tenant user", () => {
    const projected = toSidebarUser({
      avatarUrl: null,
      companyId: "company-1",
      country: "de",
      createdAt: new Date(),
      displayLanguage: "en",
      email: "person@example.com",
      firstName: "Test",
      formattingLocale: "en",
      id: "user-1",
      lastActiveAt: null,
      lastName: "Person",
      onboardingWizardCompletedAt: null,
      onboardingWikiStepCompletedAt: null,
      role: {
        createdAt: new Date(),
        description: null,
        id: "role-1",
        isSystemRole: false,
        name: "Reader",
        permissions: [
          {
            action: Action.readOwn,
            id: "permission-1",
            resource: Resource.routines,
          },
        ],
        updatedAt: new Date(),
      },
      roleId: "role-1",
      status: "active",
      theme: "dark",
      updatedAt: new Date(),
      agreeToTerms: true,
    });

    expect(projected).toEqual({
      avatarUrl: null,
      email: "person@example.com",
      firstName: "Test",
      lastName: "Person",
      role: {
        isSystemRole: false,
        permissions: [{ action: Action.readOwn, resource: Resource.routines }],
      },
    });
    expect(projected).not.toHaveProperty("companyId");
  });
});
