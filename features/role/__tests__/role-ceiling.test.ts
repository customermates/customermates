import type { Action } from "@/generated/prisma";

import { describe, expect, it } from "vitest";

import { roleExceedsCaller } from "../role-ceiling";

const lead = {
  isAdmin: false,
  allowedSystem: (resource: string, action: Action) =>
    resource === "users" && ["create", "update", "readAll"].includes(action),
  allowed: (typeId: string, action: Action) => typeId === "deals" && action === "readAll",
};
const admin = { ...lead, isAdmin: true };

describe("roleExceedsCaller", () => {
  it("refuses the Admin system role and permissions or grants the caller does not hold", () => {
    expect(roleExceedsCaller(lead, { isSystemRole: true, permissions: [] })).toBe(true);
    expect(roleExceedsCaller(lead, { permissions: [{ resource: "company", action: "update" }] })).toBe(true);
    expect(roleExceedsCaller(lead, { permissions: [{ resource: "users", action: "delete" }] })).toBe(true);
    expect(
      roleExceedsCaller(lead, { permissions: [], recordGrants: [{ typeId: "deals", actions: ["readAll", "update"] }] }),
    ).toBe(true);
    expect(
      roleExceedsCaller(lead, { permissions: [], recordGrants: [{ typeId: "tasks", actions: ["readAll"] }] }),
    ).toBe(true);
  });

  it("allows a role within the caller's permissions, reading own records when the caller reads all", () => {
    expect(
      roleExceedsCaller(lead, {
        permissions: [
          { resource: "users", action: "readAll" },
          { resource: "users", action: "readOwn" },
        ],
        recordGrants: [{ typeId: "deals", actions: ["readOwn", "readAll"] }],
      }),
    ).toBe(false);
  });

  it("keeps what the role already had and checks only what an edit adds", () => {
    const previous = {
      permissions: [{ resource: "company" as const, action: "update" as const }],
      recordGrants: [{ typeId: "tasks", actions: ["update" as const] }],
    };
    expect(roleExceedsCaller(lead, previous, previous)).toBe(false);
    expect(
      roleExceedsCaller(
        lead,
        { ...previous, permissions: [...previous.permissions, { resource: "api", action: "create" }] },
        previous,
      ),
    ).toBe(true);
  });

  it("leaves an Admin unrestricted", () => {
    expect(
      roleExceedsCaller(admin, {
        isSystemRole: true,
        permissions: [{ resource: "company", action: "update" }],
        recordGrants: [{ typeId: "tasks", actions: ["delete"] }],
      }),
    ).toBe(false);
  });
});
