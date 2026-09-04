import type { TenantUser } from "@/features/user/user.schema";
import type { AuthService } from "../auth.service";
import type { FindUserRepo } from "../../user/user.service";
import type { AccessOptions, RouteGuardSubscriptionRepo } from "../route-guard.service";
import type { GetLegalStatusInteractor } from "@/features/legal/get-legal-status.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { Action, Resource, Status, SubscriptionStatus } from "@/generated/prisma";

import {
  accessRedirectForAccountState,
  RouteGuardService,
  unauthenticatedRedirectForAccountState,
} from "../route-guard.service";

const PAST = new Date(Date.now() - 48 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

const mocks = {
  getSession: vi.fn(),
  findAuthUserCompanyIdUnscoped: vi.fn(),
  findCurrentUserUnscoped: vi.fn(),
  getSubscriptionOrThrowUnscoped: vi.fn(),
  getLegalStatus: vi.fn(),
};

function makeService() {
  return new RouteGuardService(
    { getSession: mocks.getSession } as unknown as AuthService,
    {
      findAuthUserCompanyIdUnscoped: mocks.findAuthUserCompanyIdUnscoped,
      findCurrentUserUnscoped: mocks.findCurrentUserUnscoped,
    } as unknown as FindUserRepo,
    {
      getSubscriptionOrThrowUnscoped: mocks.getSubscriptionOrThrowUnscoped,
    } as unknown as RouteGuardSubscriptionRepo,
    { invoke: mocks.getLegalStatus } as unknown as GetLegalStatusInteractor,
  );
}

async function resolveAccess(options?: AccessOptions) {
  return accessRedirectForAccountState(await makeService().resolveAccountState(), options);
}

async function resolveUnauthenticated() {
  return unauthenticatedRedirectForAccountState(await makeService().resolveAccountState());
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      createdAt: new Date(),
      email: "max@example.com",
      emailVerified: true,
      id: "auth-user-1",
      name: "Max Example",
      ...overrides,
    },
  };
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

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.APP_MODE = "cloud";
  mocks.getSession.mockResolvedValue(session());
  mocks.findAuthUserCompanyIdUnscoped.mockResolvedValue(null);
  mocks.findCurrentUserUnscoped.mockResolvedValue(user());
  mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.active));
  mocks.getLegalStatus.mockResolvedValue({ mustAccept: false });
});

describe("RouteGuardService.resolveAccountState", () => {
  it("resolves an absent session without loading product or tenant data", async () => {
    mocks.getSession.mockResolvedValue(null);

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "unauthenticated",
      user: null,
    });
    expect(mocks.findCurrentUserUnscoped).not.toHaveBeenCalled();
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("gives overdue verification precedence over every registered account blocker", async () => {
    mocks.getSession.mockResolvedValue(session({ createdAt: PAST, emailVerified: false }));
    mocks.findCurrentUserUnscoped.mockResolvedValue(user({ status: Status.inactive }));

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "overdueVerification",
      emailVerified: false,
    });
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("allows an unverified session inside the verification grace period", async () => {
    mocks.getSession.mockResolvedValue(session({ emailVerified: false }));

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "allowed",
      emailVerified: false,
    });
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.findCurrentUserUnscoped).toHaveBeenCalledWith("max@example.com");
  });

  it("resolves a session without a product user before tenant checks", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(null);

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "unregistered",
      user: null,
    });
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("uses only a live identity workspace binding for pre-tenant routing", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(null);
    mocks.findAuthUserCompanyIdUnscoped.mockResolvedValue("invited-company-id");

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "unregistered",
      sessionUser: { companyId: "invited-company-id" },
    });
  });

  it("treats a cached session for a deleted identity as unauthenticated", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(null);
    mocks.findAuthUserCompanyIdUnscoped.mockResolvedValue(undefined);

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "unauthenticated",
      sessionUser: null,
      user: null,
    });
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("rejects a deleted identity even when the same email now has a tenant user", async () => {
    mocks.findAuthUserCompanyIdUnscoped.mockResolvedValue(undefined);
    mocks.findCurrentUserUnscoped.mockResolvedValue(user());

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "unauthenticated",
      sessionUser: null,
      user: null,
    });
    expect(mocks.findCurrentUserUnscoped).not.toHaveBeenCalled();
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it.each([
    [Status.inactive, "inactive"],
    [Status.pendingAuthorization, "pending"],
  ] as const)("resolves %s before legal and subscription checks", async (status, state) => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(user({ status }));

    expect(await makeService().resolveAccountState()).toMatchObject({
      state,
    });
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("resolves incomplete administrator onboarding before tenant checks", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(user({ onboardingWizardCompletedAt: null }));

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "onboarding",
    });
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("fails closed if a new account status is not mapped explicitly", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(user({ status: "suspended" as Status }));

    await expect(makeService().resolveAccountState()).rejects.toThrow("Unsupported account status: suspended");
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("resolves overdue legal acceptance before subscription expiry", async () => {
    mocks.getLegalStatus.mockResolvedValue({ mustAccept: true });
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.unPaid));

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "legal",
      legalStatus: { mustAccept: true },
    });
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("resolves an expired subscription with the raw subscription", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, PAST));

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "subscription",
      subscription: { status: SubscriptionStatus.trial, trialEndDate: PAST },
    });
  });

  it("returns allowed only after every account check passes", async () => {
    const allowedUser = user();
    mocks.findCurrentUserUnscoped.mockResolvedValue(allowedUser);

    expect(await makeService().resolveAccountState()).toMatchObject({
      state: "allowed",
      user: allowedUser,
    });
    expect(mocks.getLegalStatus).toHaveBeenCalledOnce();
    expect(mocks.getSubscriptionOrThrowUnscoped).toHaveBeenCalledOnce();
  });
});

describe("accessRedirectForAccountState", () => {
  it("redirects to sign-in when there is no valid session", async () => {
    mocks.getSession.mockResolvedValue(null);

    expect(await resolveAccess()).toEqual({
      redirect: "/auth/signin",
    });
  });

  it.each([
    [null, null, "/onboarding"],
    [user({ status: Status.inactive }), null, "/auth/error?type=inactiveUser"],
    [user({ status: Status.pendingAuthorization }), null, "/auth/pending"],
    [user({ onboardingWizardCompletedAt: null }), null, "/onboarding/wizard"],
    [user(), { mustAccept: true }, "/legal-update"],
  ] as const)("routes a blocked account to %s", async (resolvedUser, legal, redirect) => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(resolvedUser);
    if (legal) mocks.getLegalStatus.mockResolvedValue(legal);

    expect(await resolveAccess()).toEqual({ redirect });
  });

  it("routes an unpaid subscription to the recovery page", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.unPaid));

    expect(await resolveAccess()).toEqual({
      redirect: "/subscription-expired",
    });
  });

  it("skips cloud-only account checks in demo mode", async () => {
    mockEnv.APP_MODE = "demo";
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, PAST));

    expect(await resolveAccess()).toBeNull();
    expect(mocks.getLegalStatus).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("lets an active user on a not-yet-expired trial through", async () => {
    mocks.getSubscriptionOrThrowUnscoped.mockResolvedValue(subscription(SubscriptionStatus.trial, FUTURE));

    expect(await resolveAccess()).toBeNull();
  });

  it("denies a member without the required resource permission", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(user({ role: { isSystemRole: false, permissions: [] } }));

    expect(await resolveAccess({ resource: Resource.contacts })).toEqual({
      redirect: "/",
    });
  });

  it("allows a member holding the required resource permission", async () => {
    mocks.findCurrentUserUnscoped.mockResolvedValue(
      user({
        role: {
          isSystemRole: false,
          permissions: [{ resource: Resource.contacts, action: Action.readOwn }],
        },
      }),
    );

    expect(await resolveAccess({ resource: Resource.contacts })).toBeNull();
  });

  it("lets a system-role user bypass the resource permission check", async () => {
    expect(await resolveAccess({ resource: Resource.contacts })).toBeNull();
  });
});

describe("unauthenticatedRedirectForAccountState", () => {
  it("keeps truly unauthenticated and pre-tenant sessions on public routes", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await resolveUnauthenticated()).toBeNull();

    mocks.getSession.mockResolvedValue(session());
    mocks.findCurrentUserUnscoped.mockResolvedValue(null);
    expect(await resolveUnauthenticated()).toBeNull();
  });

  it("uses the same blocker precedence as protected access", async () => {
    mocks.getSession.mockResolvedValue(session({ createdAt: PAST, emailVerified: false }));
    mocks.findCurrentUserUnscoped.mockResolvedValue(user({ status: Status.inactive }));

    expect(await resolveUnauthenticated()).toEqual({
      redirect: "/auth/verify-email",
    });
  });

  it("returns an allowed account to the app", async () => {
    expect(await resolveUnauthenticated()).toEqual({
      redirect: "/",
    });
  });
});
