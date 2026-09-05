import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideMcp: vi.fn(),
  redirect: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  resetPassword: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  social: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
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
vi.mock("@/core/utils/action-result", () => ({ serializeResult: async (result: unknown) => await result }));

import {
  requestPasswordResetAction,
  resendVerificationEmailFromAuthAction,
  resetPasswordAction,
  signUpWithEmailAction,
} from "../actions";

describe("authentication action adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPasswordReset.mockResolvedValue({ ok: true, data: null });
    mocks.resendVerification.mockResolvedValue({ ok: true });
    mocks.resetPassword.mockResolvedValue({ ok: true, data: null });
    mocks.signUp.mockResolvedValue({ ok: true, data: null });
  });

  it("passes signup data and invitation intent to the interactor", async () => {
    const data = {
      confirmEmail: "user@example.com",
      confirmPassword: "ValidPass1!",
      email: "user@example.com",
      password: "ValidPass1!",
      onboardingIntent: "signed.intent",
    };

    await signUpWithEmailAction(data);

    expect(mocks.signUp).toHaveBeenCalledExactlyOnceWith(data);
  });

  it("localizes a signup redirect returned by the interactor", async () => {
    const data = {
      confirmEmail: "user@example.com",
      confirmPassword: "ValidPass1!",
      email: "user@example.com",
      password: "ValidPass1!",
    };
    mocks.signUp.mockResolvedValue({ redirect: "/auth/error?type=invalidOnboardingIntent" });

    await signUpWithEmailAction({ ...data, onboardingIntent: "invalid.intent" });

    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/en/auth/error?type=invalidOnboardingIntent");
  });

  it("passes password recovery data and onboarding intent to their interactors", async () => {
    const request = { confirmEmail: "user@example.com", email: "user@example.com", onboardingIntent: "signed.intent" };
    const reset = {
      confirmPassword: "ValidPass1!",
      password: "ValidPass1!",
      token: "reset-token",
      onboardingIntent: "signed.intent",
    };

    await requestPasswordResetAction(request);
    await resetPasswordAction(reset);
    await resendVerificationEmailFromAuthAction("signed.intent");

    expect(mocks.requestPasswordReset).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.resetPassword).toHaveBeenCalledExactlyOnceWith(reset);
    expect(mocks.resendVerification).toHaveBeenCalledExactlyOnceWith("signed.intent");
  });
});
