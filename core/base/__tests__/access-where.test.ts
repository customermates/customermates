import type { ExtendedUser } from "@/features/user/user.types";
import type { ModelWhereInputMap } from "../base-repository";

import { describe, it, expect } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { BaseRepository } from "../base-repository";
import { runWithTenant } from "@/core/decorators/tenant-context";

class TestRepo extends BaseRepository {
  where<R extends keyof ModelWhereInputMap>(resource: R) {
    return this.accessWhere(resource);
  }
}

function makeUser(permissions: Array<{ resource: Resource; action: Action }>): ExtendedUser {
  return {
    id: "user-1",
    email: "test@test.com",
    companyId: "company-1",
    status: "active",
    role: {
      id: "role-1",
      name: "Custom",
      isSystemRole: false,
      companyId: "company-1",
      permissions: permissions.map((p, i) => ({ id: `p${i}`, roleId: "role-1", ...p })),
    },
  } as unknown as ExtendedUser;
}

describe("accessWhere", () => {
  it("scopes readOwn to owned rows (contact, the linkParticipant assignment gate)", async () => {
    const where = await runWithTenant(makeUser([{ resource: Resource.contacts, action: Action.readOwn }]), () =>
      new TestRepo().where("contact"),
    );

    expect(where).toEqual({ companyId: "company-1", users: { some: { userId: "user-1" } } });
  });

  it("scopes readAll to the whole company", async () => {
    const where = await runWithTenant(makeUser([{ resource: Resource.contacts, action: Action.readAll }]), () =>
      new TestRepo().where("contact"),
    );

    expect(where).toEqual({ companyId: "company-1" });
  });

  it("yields nothing when the user lacks the resource permission", async () => {
    const where = await runWithTenant(makeUser([]), () => new TestRepo().where("contact"));

    expect(where).toEqual({ id: { in: [] }, companyId: "company-1" });
  });
});
