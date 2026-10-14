import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, CountryCode, Resource, Status, SubscriptionPlan } from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const sessionUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => sessionUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";

import { AdminUpdateUserDetailsInteractor } from "../upsert/admin-update-user-details.interactor";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
}));

const TARGET_USER_ID = "00000000-0000-4000-8000-000000000010";
const TARGET_ROLE_ID = "00000000-0000-4000-8000-000000000011";
const TARGET_EMAIL = "teammate@example.com";
const MEMBER_ROLE = {
  ...(createMockUser().role as NonNullable<ReturnType<typeof createMockUser>["role"]>),
  id: "00000000-0000-4000-8000-000000000012",
  isSystemRole: false,
};

function harness(previousStatus: Status) {
  const userRepo = {
    isPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
    findMemberCompanyWide: vi.fn().mockResolvedValue(
      createMockUser({
        id: TARGET_USER_ID,
        email: TARGET_EMAIL,
        status: previousStatus,
        roleId: MEMBER_ROLE.id,
        role: { ...MEMBER_ROLE },
      }),
    ),
    adminUpdateDetailsOrThrow: vi.fn().mockResolvedValue(undefined),
    markAgentCreditActivatedOrThrow: vi.fn().mockResolvedValue(undefined),
    clearAgentCreditActivatedOrThrow: vi.fn().mockResolvedValue(undefined),
  };
  const roleRepo = {
    hasAnotherActiveSystemRoleUser: vi.fn().mockResolvedValue(false),
    findRoleById: vi.fn().mockResolvedValue({ id: TARGET_ROLE_ID, name: "Sales", isSystemRole: false }),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const subscriptionService = { updateSubscriptionQuantityOrThrow: vi.fn() };
  const subscriptionRepo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: SubscriptionPlan.enterprise }),
  };
  const countUsersRepo = { countActiveUsers: vi.fn() };
  const releaseOwnerRoutines = { invoke: vi.fn().mockResolvedValue({ blocked: 0, disabled: 0 }) };

  const interactor = new AdminUpdateUserDetailsInteractor(
    userRepo as never,
    roleRepo as never,
    eventService as never,
    subscriptionService as never,
    subscriptionRepo as never,
    countUsersRepo as never,
    releaseOwnerRoutines as never,
  );

  const invoke = (status: "active" | "inactive") =>
    interactor.invoke({
      email: TARGET_EMAIL,
      firstName: "Team",
      lastName: "Mate",
      country: CountryCode.de,
      status,
      avatarUrl: null,
      roleId: TARGET_ROLE_ID,
    });

  return { interactor, invoke, subscriptionRepo, userRepo, roleRepo, eventService };
}

function expectProfileUpdateBefore(profileUpdate: ReturnType<typeof vi.fn>, timestampWrite: ReturnType<typeof vi.fn>) {
  expect(profileUpdate.mock.invocationCallOrder[0]).toBeLessThan(timestampWrite.mock.invocationCallOrder[0]);
}

describe("AdminUpdateUserDetailsInteractor history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes the changed fields as previous and current values, with the role by name", async () => {
    const { invoke, eventService } = harness(Status.pendingAuthorization);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.USER_UPDATED, {
      entityId: TARGET_USER_ID,
      payload: {
        changes: expect.objectContaining({
          firstName: { previous: "Test", current: "Team" },
          lastName: { previous: "User", current: "Mate" },
          status: { previous: Status.pendingAuthorization, current: Status.active },
          role: { previous: expect.anything(), current: "Sales" },
        }),
      },
    });
  });
});

describe("AdminUpdateUserDetailsInteractor agent credit activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks agent credit activation after a pending user becomes active", async () => {
    const { invoke, userRepo } = harness(Status.pendingAuthorization);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(userRepo.markAgentCreditActivatedOrThrow).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expectProfileUpdateBefore(userRepo.adminUpdateDetailsOrThrow, userRepo.markAgentCreditActivatedOrThrow);
  });

  it("marks agent credit activation after an inactive user becomes active", async () => {
    const { invoke, userRepo } = harness(Status.inactive);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(userRepo.markAgentCreditActivatedOrThrow).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expectProfileUpdateBefore(userRepo.adminUpdateDetailsOrThrow, userRepo.markAgentCreditActivatedOrThrow);
  });

  it("does not change the activation timestamp when an active user stays active", async () => {
    const { invoke, subscriptionRepo, userRepo } = harness(Status.active);

    await expect(invoke(Status.active)).resolves.toMatchObject({ ok: true });

    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalledOnce();
    expect(userRepo.markAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expect(subscriptionRepo.getSubscriptionOrThrow).not.toHaveBeenCalled();
  });

  it("clears agent credit activation after an active user becomes inactive", async () => {
    const { invoke, userRepo } = harness(Status.active);

    await expect(invoke(Status.inactive)).resolves.toMatchObject({ ok: true });

    expect(userRepo.clearAgentCreditActivatedOrThrow).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(userRepo.markAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
    expectProfileUpdateBefore(userRepo.adminUpdateDetailsOrThrow, userRepo.clearAgentCreditActivatedOrThrow);
  });

  it("refuses a tenant-side status change on a platform operator account", async () => {
    const { userRepo, invoke } = harness(Status.active);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(true);

    const result = await invoke("inactive");

    expect(result.ok).toBe(false);
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
    expect(userRepo.clearAgentCreditActivatedOrThrow).not.toHaveBeenCalled();
  });

  it("still allows reactivating a platform operator, so a cron deactivation stays recoverable", async () => {
    const { userRepo, invoke } = harness(Status.inactive);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(true);

    const result = await invoke("active");

    expect(result.ok).toBe(true);
    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalled();
  });

  it("still allows a tenant-side status change on an ordinary account", async () => {
    const { userRepo, invoke } = harness(Status.active);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(false);

    const result = await invoke("inactive");

    expect(result.ok).toBe(true);
    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalled();
  });
});

describe("AdminUpdateUserDetailsInteractor partial member update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const failure = (result: Awaited<ReturnType<AdminUpdateUserDetailsInteractor["invoke"]>>) =>
    result.ok ? null : { codes: interactorFailureCodes(result.error), path: result.error.issues[0].path };

  it("keeps the member's current values for every field the change omits", async () => {
    const { interactor, userRepo } = harness(Status.active);

    const result = await interactor.invoke({ userId: TARGET_USER_ID, status: Status.inactive });

    expect(userRepo.findMemberCompanyWide).toHaveBeenCalledWith({ id: TARGET_USER_ID });
    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalledWith({
      userId: TARGET_USER_ID,
      email: TARGET_EMAIL,
      firstName: "Test",
      lastName: "User",
      country: CountryCode.de,
      avatarUrl: null,
      roleId: MEMBER_ROLE.id,
      status: Status.inactive,
    });
    expect(result).toMatchObject({ ok: true, data: { roleId: MEMBER_ROLE.id, status: Status.inactive } });
  });

  it("applies a new role and keeps the current status", async () => {
    const { interactor, userRepo } = harness(Status.active);

    await interactor.invoke({ userId: TARGET_USER_ID, roleId: TARGET_ROLE_ID });

    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ roleId: TARGET_ROLE_ID, status: Status.active }),
    );
  });

  it("requires a role for a member who has none yet", async () => {
    const { interactor, userRepo } = harness(Status.active);
    userRepo.findMemberCompanyWide.mockResolvedValue(
      createMockUser({ id: TARGET_USER_ID, email: TARGET_EMAIL, roleId: null, role: null }),
    );

    const result = await interactor.invoke({ userId: TARGET_USER_ID, status: Status.active });

    expect(failure(result)).toEqual({ codes: [CustomErrorCode.userRoleRequired], path: ["roleId"] });
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
  });

  it("requires a status for a member waiting for approval", async () => {
    const { interactor, userRepo } = harness(Status.pendingAuthorization);

    const result = await interactor.invoke({ userId: TARGET_USER_ID, roleId: TARGET_ROLE_ID });

    expect(failure(result)).toEqual({ codes: [CustomErrorCode.userStatusRequired], path: ["status"] });
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
  });

  it("requires a userId or email", async () => {
    const { interactor, userRepo } = harness(Status.active);

    const result = await interactor.invoke({ status: Status.inactive });

    expect(failure(result)).toEqual({ codes: [CustomErrorCode.memberReferenceRequired], path: ["userId"] });
    expect(userRepo.findMemberCompanyWide).not.toHaveBeenCalled();
  });

  it("reports a member it cannot find, or whose email does not match the userId, as not found", async () => {
    const { interactor, userRepo } = harness(Status.active);

    const mismatch = await interactor.invoke({ userId: TARGET_USER_ID, email: "other@example.com" });
    userRepo.findMemberCompanyWide.mockResolvedValue(null);
    const missing = await interactor.invoke({ email: TARGET_EMAIL, status: Status.active });

    expect(failure(mismatch)).toEqual({ codes: [CustomErrorCode.userNotFound], path: ["userId"] });
    expect(failure(missing)).toEqual({ codes: [CustomErrorCode.userNotFound], path: ["email"] });
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
  });

  it("reports an unknown role as roleNotFound instead of a database error", async () => {
    const { interactor, roleRepo, userRepo } = harness(Status.active);
    roleRepo.findRoleById.mockResolvedValue(null);

    const result = await interactor.invoke({ userId: TARGET_USER_ID, roleId: TARGET_ROLE_ID });

    expect(failure(result)).toEqual({ codes: [CustomErrorCode.roleNotFound], path: ["roleId"] });
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
  });

  it("keeps the last active system member with roleSystemRequired", async () => {
    const { interactor, userRepo } = harness(Status.active);
    userRepo.findMemberCompanyWide.mockResolvedValue(
      createMockUser({ id: TARGET_USER_ID, email: TARGET_EMAIL, status: Status.active }),
    );

    const result = await interactor.invoke({ userId: TARGET_USER_ID, roleId: TARGET_ROLE_ID });

    expect(failure(result)).toEqual({ codes: [CustomErrorCode.roleSystemRequired], path: ["roleId"] });
    expect(userRepo.adminUpdateDetailsOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a caller without Users & Roles Edit before looking the member up", async () => {
    const { interactor, userRepo } = harness(Status.active);

    await expect(
      runWithTenant(createMockUserWithPermissions([{ resource: Resource.users, action: Action.readAll }]), () =>
        interactor.invoke({ userId: TARGET_USER_ID, status: Status.active }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(userRepo.findMemberCompanyWide).not.toHaveBeenCalled();
  });
});
