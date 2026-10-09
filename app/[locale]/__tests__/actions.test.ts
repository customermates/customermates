import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  serializeResult: vi.fn(async (result: unknown) => await result),
  resolveAccountState: vi.fn(),
  signOut: vi.fn(),
  unused: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

vi.mock("@/core/di", () => ({
  getCaptureAdClickInteractor: () => ({ invoke: mocks.unused }),
  getDecideAdAttributionConsentInteractor: () => ({ invoke: mocks.unused }),
  getReadAdAttributionConsentInteractor: () => ({ invoke: mocks.unused }),
  getRouteGuardService: () => ({ resolveAccountState: mocks.resolveAccountState }),
  getSignOutInteractor: () => ({ invoke: mocks.signOut }),
  getWithdrawAdAttributionInteractor: () => ({ invoke: mocks.unused }),
}));
vi.mock("@/core/utils/action-result", () => ({ serializeResult: mocks.serializeResult }));
vi.mock("@/core/validation/validation.utils", () => ({ unwrapValidated: mocks.unused }));
import { readMarketingAccountAction, signOutAction, signOutWithOnboardingIntentAction } from "../actions";

describe("shared account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ redirect: "/" });
  });

  it("returns the account state and only the signed-in person's own display profile", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "allowed",
      sessionUser: { email: "session@example.com", name: "Session Name", image: null },
      user: { id: "user-1", firstName: "Anna", lastName: "Müller", email: "anna@example.com", avatarUrl: "/a.png", companyId: "c-1" },
      legalStatus: { accepted: true },
      subscription: { status: "active" },
    });

    await expect(readMarketingAccountAction()).resolves.toStrictEqual({
      profile: { avatarUrl: "/a.png", email: "anna@example.com", name: "Anna Müller" },
      state: "allowed",
    });
  });

  it("falls back to the session identity before registration and returns no profile when signed out", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "unregistered",
      sessionUser: { email: "new@example.com", name: "New Person", image: "/g.png" },
      user: null,
    });
    await expect(readMarketingAccountAction()).resolves.toStrictEqual({
      profile: { avatarUrl: "/g.png", email: "new@example.com", name: "New Person" },
      state: "unregistered",
    });

    mocks.resolveAccountState.mockResolvedValue({ state: "unauthenticated", sessionUser: null, user: null });
    await expect(readMarketingAccountAction()).resolves.toStrictEqual({ profile: null, state: "unauthenticated" });
  });

  it("delegates ordinary sign out to the interactor", async () => {
    await signOutAction();

    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith();
  });

  it("localizes the invitation sign-out destination returned by the interactor", async () => {
    mocks.signOut.mockResolvedValue({ redirect: "/auth/signup?intent=signed.intent" });

    await signOutWithOnboardingIntentAction("signed.intent");

    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ onboardingIntent: "signed.intent" });
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/en/auth/signup?intent=signed.intent");
  });
});
