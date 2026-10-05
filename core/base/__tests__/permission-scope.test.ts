import { describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { routineAccessWhere } from "@/ee/routines/routine-access";
import { userAccessWhere } from "@/features/user/user-access";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { PermissionService, rolePermits, roleReadScope } from "../permission.service";

const permissions = new PermissionService();

describe("routine access scope", () => {
  it("scopes readOwn to owned routines", async () => {
    const where = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readOwn }]),
      () => routineAccessWhere(permissions),
    );

    expect(where).toEqual({ companyId: "test-company-id", ownerUserId: "test-user-id" });
  });

  it("scopes readAll to the whole company", async () => {
    const where = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readAll }]),
      () => routineAccessWhere(permissions),
    );

    expect(where).toEqual({ companyId: "test-company-id" });
  });

  it("yields nothing when the user lacks the resource permission", async () => {
    const where = await runWithTenant(createMockUserWithPermissions([]), () => routineAccessWhere(permissions));

    expect(where).toEqual({ id: { in: [] }, companyId: "test-company-id" });
  });

  it("grants a system role the whole company regardless of explicit permissions", async () => {
    const where = await runWithTenant(createMockUser(), () => routineAccessWhere(permissions));

    expect(where).toEqual({ companyId: "test-company-id" });
  });
});

describe("user access scope", () => {
  it("shows the whole directory with readAll", async () => {
    const where = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.users, action: Action.readAll }]),
      () => userAccessWhere(permissions),
    );

    expect(where).toEqual({ companyId: "test-company-id" });
  });

  it("shows only the current user with readOwn", async () => {
    const where = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.users, action: Action.readOwn }]),
      () => userAccessWhere(permissions),
    );

    expect(where).toEqual({ id: "test-user-id", companyId: "test-company-id" });
  });

  it("shows nobody without a users permission", async () => {
    const where = await runWithTenant(createMockUserWithPermissions([]), () => userAccessWhere(permissions));

    expect(where).toEqual({ id: { in: [] }, companyId: "test-company-id" });
  });
});

describe("role permission rule", () => {
  const role = { isSystemRole: false, permissions: [{ resource: "routines", action: "readOwn" }] };

  it("allows only granted actions and everything for a system role", () => {
    expect(rolePermits(role, "routines", "readOwn")).toBe(true);
    expect(rolePermits(role, "routines", "readAll")).toBe(false);
    expect(rolePermits({ isSystemRole: true, permissions: [] }, "routines", "delete")).toBe(true);
    expect(rolePermits(null, "routines", "readOwn")).toBe(false);
  });

  it("prefers readAll over readOwn when resolving a read scope", () => {
    expect(roleReadScope(role, "routines")).toBe("own");
    expect(
      roleReadScope(
        { isSystemRole: false, permissions: [...role.permissions, { resource: "routines", action: "readAll" }] },
        "routines",
      ),
    ).toBe("all");
    expect(roleReadScope(role, "users")).toBe("none");
  });

  it("answers for the tenant user through the injected service", async () => {
    const result = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readOwn }]),
      () => [
        permissions.has(Resource.wiki, Action.readOwn),
        permissions.canRead(Resource.wiki),
        permissions.canRead(Resource.api),
      ],
    );

    expect(result).toEqual([true, true, false]);
  });
});
