import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  serializeResult: vi.fn(async (result: unknown) => await result),
  signOut: vi.fn(),
  unused: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

vi.mock("@/core/di", () => ({
  getCaptureAdClickInteractor: () => ({ invoke: mocks.unused }),
  getDecideAdAttributionConsentInteractor: () => ({ invoke: mocks.unused }),
  getReadAdAttributionConsentInteractor: () => ({ invoke: mocks.unused }),
  getSignOutInteractor: () => ({ invoke: mocks.signOut }),
  getWithdrawAdAttributionInteractor: () => ({ invoke: mocks.unused }),
}));
vi.mock("@/core/utils/action-result", () => ({ serializeResult: mocks.serializeResult }));
vi.mock("@/core/validation/validation.utils", () => ({ unwrapValidated: mocks.unused }));
import { signOutAction, signOutWithOnboardingIntentAction } from "../actions";

describe("shared account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ redirect: "/" });
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
