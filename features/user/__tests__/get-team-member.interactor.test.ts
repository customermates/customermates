import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, CountryCode, Resource, Status } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const sessionUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => sessionUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";

import { GetTeamMemberInteractor } from "../get/get-team-member.interactor";

const MEMBER_ID = "00000000-0000-4000-8000-000000000020";

const member = {
  id: MEMBER_ID,
  email: "member@example.com",
  firstName: "Sofia",
  lastName: "Member",
  roleId: null,
  status: Status.active,
  country: CountryCode.de,
  avatarUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const repo = { getUserById: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  repo.getUserById.mockResolvedValue(member);
});

function invokeAs(permissions: Array<{ resource: Resource; action: Action }>) {
  return runWithTenant(createMockUserWithPermissions(permissions), () =>
    new GetTeamMemberInteractor(repo).invoke({ id: MEMBER_ID }),
  );
}

describe("GetTeamMemberInteractor", () => {
  it.each([
    ["read Own without Manage", [{ resource: Resource.users, action: Action.readOwn }]],
    ["read All without Manage", [{ resource: Resource.users, action: Action.readAll }]],
    [
      "Manage with read Own, which cannot reach another member",
      [
        { resource: Resource.users, action: Action.readOwn },
        { resource: Resource.users, action: Action.update },
      ],
    ],
  ])("refuses a caller with %s before looking the member up", async (_label, permissions) => {
    await expect(invokeAs(permissions)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.getUserById).not.toHaveBeenCalled();
  });

  it("returns the member to a caller with Manage and read All", async () => {
    const result = await invokeAs([
      { resource: Resource.users, action: Action.readAll },
      { resource: Resource.users, action: Action.update },
    ]);

    expect(result).toEqual({ ok: true, data: { user: member } });
    expect(repo.getUserById).toHaveBeenCalledWith(MEMBER_ID);
  });
});
