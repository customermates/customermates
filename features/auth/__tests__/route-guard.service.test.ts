import type { TenantUser } from "@/features/user/user.schema";
import type { AuthService } from "../auth.service";
import type { UserService } from "../../user/user.service";
import type { RouteGuardSubscriptionRepo } from "../route-guard.service";
import type { GetLegalStatusInteractor } from "@/features/legal/get-legal-status.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { Action, Resource, Status, SubscriptionStatus } from "@/generated/prisma";

import { RouteGuardService } from "../route-guard.service";

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

const mocks = {
  resolveSession: vi.fn(),
  getUser: vi.fn(),
  getSubscriptionOrThrowUnscoped: vi.fn(),
  getLegalStatus: vi.fn(),
};

function makeService() {
  return new RouteGuardService(
    { resolveSession: mocks.resolveSession } as unknown as AuthService,
    { getUser: mocks.getUser } as unknown as UserService,
    {
      getSubscriptionOrThrowUnscoped: mocks.getSubscriptionOrThrowUnscoped,
    } as unknown as RouteGuardSubscriptionRepo,
    { invoke: mocks.getLegalStatus } as unknown as GetLegalStatusInteractor,
  );
}

function user(overrides: Record<string, unknown> = {}): TenantUser {
  return {
    id: "user-1",
    email: "max@example.com",
    companyId: "company-1",
    status: Status.active,
    onboardingWizardCompletedAt: new Date(),
    role: { isSystemRole: true, permissions: [] },
    ...overrides,
  } as unknown as TenantUser;
}

function subscription(status: SubscriptionStatus, trialEndDate: Date | null = null) {
  return { status, trialEndDate };
}

describe("RouteGuardService.resolveAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mocks.resolveSession.mockResolvedValue({ session: {} });
    mocks.getUser.mockResolvedValue(user());
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.active));
    mocks.getLegalStatus.mockResolvedValue({ mustAccept: false });
  });

  it("redirects to sign-in when there is no valid session", async () => {
    mocks.resolveSession.mockResolvedValue({ redirect: "/auth/signin" });

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/auth/signin",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("sends a session without a product user to the onboarding wizard", async () => {
    mocks.getUser.mockResolvedValue(null);

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/onboarding/wizard",
    });
  });

  it("routes an inactive user to the inactive-account error, never the expiry page", async () => {
    mocks.getUser.mockResolvedValue(user({ status: Status.inactive }));

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/auth/error?type=inactiveUser",
    });
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("routes a pending-authorization user to the pending page", async () => {
    mocks.getUser.mockResolvedValue(user({ status: Status.pendingAuthorization }));

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/auth/pending",
    });
  });

  it("sends a system-role user with incomplete onboarding to the wizard", async () => {
    mocks.getUser.mockResolvedValue(user({ onboardingWizardCompletedAt: null }));

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/onboarding/wizard",
    });
  });

  it("routes an active user whose trial has expired to the subscription-expired page", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, PAST));

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/subscription-expired",
    });
  });

  it("runs the legal deadline check after onboarding and before subscription expiry", async () => {
    mocks.getLegalStatus.mockResolvedValue({ mustAccept: true });
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.unPaid));

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/legal-update",
    });
    expect(mocks.getLegalStatus).toHaveBeenCalledTimes(1);
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("skips the legal check on the legal-update route while still allowing subscription to be skipped", async () => {
    mocks.getLegalStatus.mockResolvedValue({ mustAccept: true });
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.unPaid));

    expect(
      await makeService().resolveAccess({
        skipLegalAcceptanceCheck: true,
        skipSubscriptionCheck: true,
      }),
    ).toBeNull();
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("routes an active user on an unpaid subscription to the subscription-expired page", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.unPaid));

    expect(await makeService().resolveAccess()).toEqual({
      redirect: "/subscription-expired",
    });
  });

  it("lets an active user on an active subscription through", async () => {
    expect(await makeService().resolveAccess()).toBeNull();
  });

  it("lets an active user on a not-yet-expired trial through", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, FUTURE));

    expect(await makeService().resolveAccess()).toBeNull();
  });

  it("skips the subscription check in demo mode", async () => {
    mockEnv.APP_MODE = "demo";
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, PAST));

    expect(await makeService().resolveAccess()).toBeNull();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
  });

  it("skips the subscription check when skipSubscriptionCheck is set (the expiry page's own guard)", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, PAST));

    expect(
      await makeService().resolveAccess({
        resource: Resource.company,
        skipSubscriptionCheck: true,
      }),
    ).toBeNull();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("denies a non-system-role user without the required resource permission", async () => {
    mocks.getUser.mockResolvedValue(user({ role: { isSystemRole: false, permissions: [] } }));

    expect(await makeService().resolveAccess({ resource: Resource.contacts })).toEqual({ redirect: "/" });
  });

  it("allows a non-system-role user holding the required resource permission", async () => {
    mocks.getUser.mockResolvedValue(
      user({
        role: {
          isSystemRole: false,
          permissions: [{ resource: Resource.contacts, action: Action.readOwn }],
        },
      }),
    );

    expect(await makeService().resolveAccess({ resource: Resource.contacts })).toBeNull();
  });

  it("lets a system-role user bypass the resource permission check", async () => {
    expect(await makeService().resolveAccess({ resource: Resource.contacts })).toBeNull();
  });
});
