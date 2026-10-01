import type { ModelWhereInputMap } from "../base-repository";

import { describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { BaseRepository } from "../base-repository";

class TestRepo extends BaseRepository {
  where<R extends keyof ModelWhereInputMap>(resource: R) {
    return this.accessWhere(resource);
  }
}

describe("accessWhere", () => {
  it("scopes readOwn to owned rows (routine owner)", async () => {
    const where = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readOwn }]),
      () => new TestRepo().where("routine"),
    );

    expect(where).toEqual({ companyId: "test-company-id", ownerUserId: "test-user-id" });
  });

  it("scopes readAll to the whole company", async () => {
    const where = await runWithTenant(
      createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readAll }]),
      () => new TestRepo().where("routine"),
    );

    expect(where).toEqual({ companyId: "test-company-id" });
  });

  it("yields nothing when the user lacks the resource permission", async () => {
    const where = await runWithTenant(createMockUserWithPermissions([]), () => new TestRepo().where("routine"));

    expect(where).toEqual({ id: { in: [] }, companyId: "test-company-id" });
  });

  it("grants a system role the whole company regardless of explicit permissions", async () => {
    const where = await runWithTenant(createMockUser(), () => new TestRepo().where("routine"));

    expect(where).toEqual({ companyId: "test-company-id" });
  });
});
