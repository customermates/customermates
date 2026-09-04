import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideMcp: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  resetPassword: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  social: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/core/di", () => ({
  getContinueWithSocialsInteractor: () => ({ invoke: mocks.social }),
  getDecideMcpConsentInteractor: () => ({ invoke: mocks.decideMcp }),
  getRequestPasswordResetInteractor: () => ({ invoke: mocks.requestPasswordReset }),
  getResendVerificationEmailInteractor: () => ({ invoke: mocks.resendVerification }),
  getResetPasswordInteractor: () => ({ invoke: mocks.resetPassword }),
  getSignInWithEmailInteractor: () => ({ invoke: mocks.signIn }),
  getSignUpWithEmailInteractor: () => ({ invoke: mocks.signUp }),
}));
vi.mock("@/core/utils/action-result", () => ({
  serializeResult: async (result: unknown) => await result,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));

import {
  requestPasswordResetAction,
  resendVerificationEmailFromAuthAction,
  resetPasswordAction,
  signUpWithEmailAction,
} from "../actions";

const invitation = {
  companyId: "company-a",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  intent: "signed.intent",
  inviterName: "Invite Admin",
  source: "explicit",
  status: "valid",
  token: "invite-a",
  type: "invitation",
} as const;
const createIntent = {
  authUserId: "auth-user-one",
  intent: "signed.create",
  source: "explicit",
  status: "valid",
  type: "createCompany",
} as const;

describe("authentication actions preserve onboarding intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);
    mocks.requestPasswordReset.mockResolvedValue({ ok: true, data: null });
    mocks.resendVerification.mockResolvedValue({ ok: true });
    mocks.resetPassword.mockResolvedValue({ ok: true, data: null });
    mocks.signUp.mockResolvedValue({ ok: true, data: null });
  });

  it.each([
    [invitation, "signed.intent"],
    [createIntent, "signed.create"],
  ])("keeps a valid invitation or create choice in password reset", async (resolved, intent) => {
    mocks.resolveOnboardingIntent.mockResolvedValue(resolved);
    const data = { confirmEmail: "user@example.com", email: "user@example.com" };

    await requestPasswordResetAction(data, intent);

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith(data, `/auth/reset-password?intent=${intent}`);
  });

  it("keeps the same intent through reset success and invalid-token recovery", async () => {
    const data = { confirmPassword: "ValidPass1!", password: "ValidPass1!", token: "reset-token" };

    await resetPasswordAction(data, "signed.intent");

    expect(mocks.resetPassword).toHaveBeenCalledWith(data, {
      error: "/auth/forgot-password?info=RESET_LINK_INVALID&intent=signed.intent",
      success: "/auth/signin?intent=signed.intent",
    });
  });

  it.each([
    [invitation, "/auth/invitation?intent=signed.intent"],
    [createIntent, "/onboarding/wizard?intent=signed.create"],
  ])("sends verification back to the exact onboarding destination", async (resolved, callbackURL) => {
    mocks.resolveOnboardingIntent.mockResolvedValue(resolved);

    await resendVerificationEmailFromAuthAction(resolved.intent);

    expect(mocks.resendVerification).toHaveBeenCalledWith(callbackURL);
  });

  it("does not let an expired onboarding intent block account recovery", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "onboardingSessionExpired",
      source: "explicit",
      status: "invalid",
    });

    const data = { confirmEmail: "a@b.co", email: "a@b.co" };
    await requestPasswordResetAction(data, "expired");

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith(data);

    const resetData = { confirmPassword: "ValidPass1!", password: "ValidPass1!", token: "valid-reset" };
    await resetPasswordAction(resetData, "expired");
    expect(mocks.resetPassword).toHaveBeenCalledWith(resetData);
  });

  it("does not allow a create-company intent on the account-signup route", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue(createIntent);

    await expect(
      signUpWithEmailAction(
        {
          confirmEmail: "user@example.com",
          confirmPassword: "ValidPass1!",
          email: "user@example.com",
          password: "ValidPass1!",
        },
        "signed.create",
      ),
    ).rejects.toThrow("REDIRECT:/en/auth/error?type=invalidOnboardingIntent");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
