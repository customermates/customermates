import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("en") }));
vi.mock("@/features/auth/next/require", () => ({ requireAccountState: mocks.requireAccountState }));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: "centered-card-page" }));
vi.mock("../verify-email-card", () => ({ VerifyEmailCard: "verify-email-card" }));

import VerifyEmailPage from "../page";

describe("VerifyEmailPage onboarding intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves an invitation when the session expires before the page loads", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      companyId: "company-a",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      intent: "signed.intent",
      inviterName: "Invite Admin",
      source: "explicit",
      status: "valid",
      token: "invite-a",
      type: "invitation",
    });
    mocks.requireAccountState.mockImplementation((_expected, _fallback, redirects) => {
      throw new Error(`REDIRECT:${redirects.unauthenticated}`);
    });

    await expect(VerifyEmailPage({ searchParams: Promise.resolve({ intent: "signed.intent" }) })).rejects.toThrow(
      "REDIRECT:/auth/signin?intent=signed.intent",
    );
    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith("signed.intent");
    expect(mocks.requireAccountState).toHaveBeenCalledWith(
      ["overdueVerification", "unregistered"],
      "/",
      expect.objectContaining({ unauthenticated: "/auth/signin?intent=signed.intent" }),
    );
  });

  it("lets an overdue account verify when an onboarding intent is invalid", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "onboardingSessionExpired",
      source: "explicit",
      status: "invalid",
    });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { email: "invited@example.com", id: "auth-user" },
      state: "overdueVerification",
    });

    const result = await VerifyEmailPage({ searchParams: Promise.resolve({ intent: "expired.intent" }) });
    const card = result.props.children;

    expect(card.props).toMatchObject({ email: "invited@example.com" });
    expect(card.props.inviterName).toBeUndefined();
    expect(card.props.onboardingIntent).toBeUndefined();
  });
});
