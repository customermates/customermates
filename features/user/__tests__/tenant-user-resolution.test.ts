import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { Action, Resource } from "@/generated/prisma";

import { UserService, type FindUserRepo } from "../user.service";

const sessionUser = createMockUser({ id: "session-user" });
const tenantUser = createMockUser({ id: "tenant-user" });

function service(overrides: Partial<FindUserRepo> = {}) {
  const repo = {
    findCurrentUserUnscoped: vi.fn(),
    findCurrentUserOrThrowUnscoped: vi.fn().mockResolvedValue(sessionUser),
    findUserByIdOrThrowUnscoped: vi.fn().mockResolvedValue(tenantUser),
    ...overrides,
  } as unknown as FindUserRepo;
  const authService = { getSession: vi.fn().mockResolvedValue({ user: { email: "session@example.com" } }) };

  return new UserService(authService as never, repo);
}

describe("resolving the user an operation runs as", () => {
  it("prefers the established tenant identity over a session lookup", async () => {
    const users = service();

    const resolved = await runWithTenant(tenantUser, () => users.getActiveTenantUserOrThrow());

    expect(resolved.id).toBe("tenant-user");
  });

  it("falls back to the session when nothing established an identity", async () => {
    const users = service();

    const resolved = await users.getActiveTenantUserOrThrow();

    expect(resolved.id).toBe("session-user");
  });

  it("refuses an established identity that is no longer active", async () => {
    const users = service();
    const inactive = createMockUser({ id: "inactive", status: "inactive" as never });

    await expect(runWithTenant(inactive, () => users.getActiveTenantUserOrThrow())).rejects.toThrow("not active");
  });

  it("still demands a session when the tenant guard is bypassed rather than assumed", async () => {
    const users = service();

    const resolved = await runWithoutTenant(() => users.getActiveTenantUserOrThrow());

    expect(resolved.id).toBe("session-user");
  });

  it("reads permissions off the resolved user without another session round trip", () => {
    const users = service();
    const withRole = createMockUser({
      id: "scoped",
      role: {
        id: "r",
        isSystemRole: false,
        permissions: [{ resource: Resource.contacts, action: Action.readAll }],
      } as never,
    });

    expect(users.hasPermissionForUser(withRole, Resource.contacts, Action.readAll)).toBe(true);
    expect(users.hasPermissionForUser(withRole, Resource.deals, Action.readAll)).toBe(false);
    expect(users.hasPermissionForUser({ ...withRole, role: null } as never, Resource.contacts, Action.readAll)).toBe(
      false,
    );
  });
});
