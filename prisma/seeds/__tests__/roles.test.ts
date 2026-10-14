import { describe, expect, it } from "vitest";

import { UpsertRoleSchema } from "@/features/role/role-management.schema";
import { SYNTHETIC_ROLE_DEFINITIONS } from "../roles";

describe("seeded roles", () => {
  it.each(SYNTHETIC_ROLE_DEFINITIONS.filter((role) => !role.isSystemRole).map((role) => [role.name, role] as const))(
    "saves %s back unchanged through the roles/save validation",
    (_name, role) => {
      const resources = [...new Set(role.permissions.map((permission) => permission.resource))];
      const parsed = UpsertRoleSchema.safeParse({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: resources.map((resource) => ({
          resource,
          actions: role.permissions
            .filter((permission) => permission.resource === resource)
            .map((permission) => permission.action),
        })),
        recordGrants: [],
        expectedRevision: 1,
        idempotencyKey: `seed-${role.id}`,
      });
      expect(parsed.error?.issues ?? []).toEqual([]);
    },
  );
});
