import { beforeEach, describe, expect, it, vi } from "vitest";

import { CountryCode, Status, SubscriptionPlan } from "@/generated/prisma";
import { createMockUser } from "@/tests/helpers/mock-user";
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

function harness(previousStatus: Status) {
  const userRepo = {
    findExistingEmailsCompanyWide: vi.fn().mockResolvedValue(new Set([TARGET_EMAIL])),
    isPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
    findOrThrowCompanyWide: vi.fn().mockResolvedValue(
      createMockUser({
        id: TARGET_USER_ID,
        email: TARGET_EMAIL,
        status: previousStatus,
      }),
    ),
    adminUpdateDetailsOrThrow: vi.fn().mockResolvedValue(undefined),
    markAgentCreditActivatedOrThrow: vi.fn().mockResolvedValue(undefined),
    clearAgentCreditActivatedOrThrow: vi.fn().mockResolvedValue(undefined),
  };
  const roleRepo = {
    isSystemRoleOrThrow: vi.fn().mockResolvedValue(false),
    hasAnotherActiveSystemRoleUser: vi.fn(),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const subscriptionService = { updateSubscriptionQuantityOrThrow: vi.fn() };
  const subscriptionRepo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: SubscriptionPlan.enterprise }),
  };
  const countUsersRepo = { countActiveUsers: vi.fn() };

  const interactor = new AdminUpdateUserDetailsInteractor(
    userRepo as never,
    roleRepo as never,
    eventService as never,
    subscriptionService as never,
    subscriptionRepo as never,
    countUsersRepo as never,
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

  return { invoke, subscriptionRepo, userRepo };
}

function expectProfileUpdateBefore(profileUpdate: ReturnType<typeof vi.fn>, timestampWrite: ReturnType<typeof vi.fn>) {
  expect(profileUpdate.mock.invocationCallOrder[0]).toBeLessThan(timestampWrite.mock.invocationCallOrder[0]);
}

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

  it("still allows a tenant-side status change on an ordinary account", async () => {
    const { userRepo, invoke } = harness(Status.active);
    userRepo.isPlatformOperatorCompanyWide.mockResolvedValue(false);

    const result = await invoke("inactive");

    expect(result.ok).toBe(true);
    expect(userRepo.adminUpdateDetailsOrThrow).toHaveBeenCalled();
  });
});
