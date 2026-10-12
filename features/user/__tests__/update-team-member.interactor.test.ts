import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, CountryCode, Resource, Status } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const sessionUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => sessionUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";

import { UpdateTeamMemberInteractor } from "../upsert/update-team-member.interactor";

const MEMBER_ID = "00000000-0000-4000-8000-000000000020";
const ROLE_ID = "00000000-0000-4000-8000-000000000030";
const NEW_ROLE_ID = "00000000-0000-4000-8000-000000000031";

const member = {
  id: MEMBER_ID,
  email: "member@example.com",
  firstName: "Sofia",
  lastName: "Member",
  roleId: ROLE_ID as string | null,
  status: Status.active,
  country: CountryCode.de,
  avatarUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const repo = { getUserById: vi.fn() };
const adminUpdate = { invoke: vi.fn() };
const manager = [
  { resource: Resource.users, action: Action.readAll },
  { resource: Resource.users, action: Action.update },
];

beforeEach(() => {
  vi.clearAllMocks();
  repo.getUserById.mockResolvedValue(member);
  adminUpdate.invoke.mockImplementation((data: unknown) => Promise.resolve({ ok: true, data }));
});

function invokeAs(permissions: Array<{ resource: Resource; action: Action }>, data: Record<string, unknown>) {
  return runWithTenant(createMockUserWithPermissions(permissions), () =>
    new UpdateTeamMemberInteractor(repo, adminUpdate as never).invoke(data as never),
  );
}

describe("UpdateTeamMemberInteractor", () => {
  it("keeps the member's current values for every field the change omits", async () => {
    const result = await invokeAs(manager, { userId: MEMBER_ID, status: Status.inactive });

    expect(adminUpdate.invoke).toHaveBeenCalledWith({
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      country: member.country,
      avatarUrl: null,
      roleId: ROLE_ID,
      status: Status.inactive,
    });
    expect(result).toMatchObject({ ok: true, data: { roleId: ROLE_ID, status: Status.inactive } });
  });

  it("applies a new role and keeps the current status", async () => {
    await invokeAs(manager, { userId: MEMBER_ID, roleId: NEW_ROLE_ID });

    expect(adminUpdate.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ roleId: NEW_ROLE_ID, status: Status.active }),
    );
  });

  it("requires a role for a member who has none yet", async () => {
    repo.getUserById.mockResolvedValue({ ...member, roleId: null });

    const result = await invokeAs(manager, { userId: MEMBER_ID, status: Status.active });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]).toMatchObject({ path: ["roleId"] });
    expect(adminUpdate.invoke).not.toHaveBeenCalled();
  });

  it("reports a member it cannot find as not found", async () => {
    repo.getUserById.mockResolvedValue(null);

    const result = await invokeAs(manager, { userId: MEMBER_ID, status: Status.active });

    expect(result.ok).toBe(false);
    expect(adminUpdate.invoke).not.toHaveBeenCalled();
  });

  it("refuses a caller without Manage and read All before looking the member up", async () => {
    await expect(
      invokeAs([{ resource: Resource.users, action: Action.readAll }], { userId: MEMBER_ID, status: Status.active }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.getUserById).not.toHaveBeenCalled();
  });
});
