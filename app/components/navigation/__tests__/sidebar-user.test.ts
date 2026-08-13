import { describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { sidebarUserCanAccess, sidebarUserCanManage, toSidebarUser, type SidebarUser } from "../sidebar-user";

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
  it("gives a system role the same visible destinations and actions as the full sidebar", () => {
    const user = sidebarUser({ role: { isSystemRole: true, permissions: [] } });

    expect(sidebarUserCanAccess(user, Resource.contacts)).toBe(true);
    expect(sidebarUserCanManage(user, Resource.contacts)).toBe(true);
  });

  it.each([Action.readOwn, Action.readAll])("shows a resource with %s permission", (action) => {
    const user = sidebarUser({
      role: {
        isSystemRole: false,
        permissions: [{ action, resource: Resource.contacts }],
      },
    });

    expect(sidebarUserCanAccess(user, Resource.contacts)).toBe(true);
    expect(sidebarUserCanAccess(user, Resource.deals)).toBe(false);
    expect(sidebarUserCanManage(user, Resource.contacts)).toBe(false);
  });

  it("requires every mutation permission before showing a management action", () => {
    const user = sidebarUser({
      role: {
        isSystemRole: false,
        permissions: [Action.create, Action.update, Action.delete].map((action) => ({
          action,
          resource: Resource.contacts,
        })),
      },
    });

    expect(sidebarUserCanManage(user, Resource.contacts)).toBe(true);
    expect(sidebarUserCanManage(user, Resource.deals)).toBe(false);
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
            resource: Resource.contacts,
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
        permissions: [{ action: Action.readOwn, resource: Resource.contacts }],
      },
    });
    expect(projected).not.toHaveProperty("companyId");
  });
});
