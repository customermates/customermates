import { beforeEach, describe, expect, it, vi } from "vitest";

import { CountryCode, Status } from "@/generated/prisma";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

const { AdminUpdateUserDetailsInteractor } = await import("../upsert/admin-update-user-details.interactor");

const data = {
  email: "target@example.com",
  firstName: "Target",
  lastName: "User",
  country: CountryCode.de,
  status: Status.inactive,
  avatarUrl: null,
  roleId: "00000000-0000-4000-8000-000000000001",
};

function make(targetStatus: Status) {
  const userRepo = {
    findExistingEmailsCompanyWide: vi.fn().mockResolvedValue(new Set([data.email])),
    findOrThrowCompanyWide: vi.fn().mockResolvedValue(
      createMockUser({
        id: "target-user-id",
        companyId: mockUser.companyId,
        email: data.email,
        status: targetStatus,
        roleId: "00000000-0000-4000-8000-000000000002",
      }),
    ),
    adminUpdateDetails: vi.fn().mockResolvedValue(undefined),
  };
  const roleRepo = {
    isSystemRoleOrThrow: vi.fn().mockResolvedValue(false),
    hasAnotherActiveSystemRoleUser: vi.fn().mockResolvedValue(true),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const subscriptionService = {
    updateSubscriptionQuantityOrThrow: vi.fn().mockResolvedValue(undefined),
  };
  const subscriptionRepo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: "pro", lemonSqueezyId: "sub-1" }),
    assertNoCheckoutReservationInProgress: vi.fn().mockResolvedValue(undefined),
  };
  const countUsersRepo = { countActiveUsers: vi.fn().mockResolvedValue(2) };
  const interactor = new AdminUpdateUserDetailsInteractor(
    userRepo as never,
    roleRepo as never,
    eventService as never,
    subscriptionService as never,
    subscriptionRepo as never,
    countUsersRepo as never,
  );

  return {
    interactor,
    userRepo,
    eventService,
    subscriptionService,
    subscriptionRepo,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("AdminUpdateUserDetailsInteractor billing quantity", () => {
  it("updates provider seat quantity when active membership changes", async () => {
    const { interactor, userRepo, subscriptionService, subscriptionRepo } = make(Status.active);

    await expect(interactor.invoke(data)).resolves.toMatchObject({ ok: true });

    expect(userRepo.adminUpdateDetails).toHaveBeenCalledWith({
      userId: "target-user-id",
      ...data,
    });
    expect(subscriptionRepo.assertNoCheckoutReservationInProgress).toHaveBeenCalledWith(expect.any(Date));
    expect(subscriptionRepo.assertNoCheckoutReservationInProgress.mock.invocationCallOrder[0]).toBeLessThan(
      userRepo.adminUpdateDetails.mock.invocationCallOrder[0],
    );
    expect(subscriptionService.updateSubscriptionQuantityOrThrow).toHaveBeenCalledWith("sub-1", 2);
  });

  it("does not update provider quantity when the active status is unchanged", async () => {
    const { interactor, subscriptionService, subscriptionRepo } = make(Status.inactive);

    await expect(interactor.invoke(data)).resolves.toMatchObject({ ok: true });

    expect(subscriptionService.updateSubscriptionQuantityOrThrow).not.toHaveBeenCalled();
    expect(subscriptionRepo.assertNoCheckoutReservationInProgress).not.toHaveBeenCalled();
  });

  it("stops before the membership mutation when a checkout reservation is active", async () => {
    const { interactor, userRepo, eventService, subscriptionService, subscriptionRepo } = make(Status.active);
    subscriptionRepo.assertNoCheckoutReservationInProgress.mockRejectedValueOnce(
      new Error("Workspace membership cannot change while checkout is in progress"),
    );

    await expect(interactor.invoke(data)).rejects.toThrow("membership cannot change");

    expect(subscriptionRepo.assertNoCheckoutReservationInProgress).toHaveBeenCalledWith(expect.any(Date));
    expect(userRepo.adminUpdateDetails).not.toHaveBeenCalled();
    expect(subscriptionService.updateSubscriptionQuantityOrThrow).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });
});
