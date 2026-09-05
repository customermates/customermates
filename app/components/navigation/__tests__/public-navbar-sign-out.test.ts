import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signOutWithOnboardingIntent: vi.fn(),
}));

vi.mock("@/app/[locale]/actions", () => ({
  signOutAction: mocks.signOut,
  signOutWithOnboardingIntentAction: mocks.signOutWithOnboardingIntent,
}));

import { signOutFromPublicNavbar } from "../public-navbar-sign-out";

describe("signOutFromPublicNavbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses ordinary sign out when no onboarding intent is active", async () => {
    mocks.signOut.mockResolvedValue({ ok: true });

    await expect(signOutFromPublicNavbar()).resolves.toEqual({ ok: true });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.signOutWithOnboardingIntent).not.toHaveBeenCalled();
  });

  it("preserves an active onboarding intent through sign out", async () => {
    mocks.signOutWithOnboardingIntent.mockResolvedValue(undefined);

    await expect(signOutFromPublicNavbar("signed.intent")).resolves.toBeNull();
    expect(mocks.signOutWithOnboardingIntent).toHaveBeenCalledExactlyOnceWith("signed.intent");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
