import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideMcp: vi.fn(),
  magicLink: vi.fn(),
  redirect: vi.fn(),
  refuseBots: vi.fn(),
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
  getRequestMagicLinkInteractor: () => ({ invoke: mocks.magicLink }),
  getRequestPasswordResetInteractor: () => ({ invoke: mocks.requestPasswordReset }),
  getResendVerificationEmailInteractor: () => ({ invoke: mocks.resendVerification }),
  getResetPasswordInteractor: () => ({ invoke: mocks.resetPassword }),
  getSignInWithEmailInteractor: () => ({ invoke: mocks.signIn }),
  getSignUpWithEmailInteractor: () => ({ invoke: mocks.signUp }),
}));
vi.mock("@/core/utils/action-result", () => ({ serializeResult: async (result: unknown) => await result }));
vi.mock("@/core/security/bot-check", () => ({ refuseBots: mocks.refuseBots }));

import {
  continueWithGoogleAction,
  continueWithMicrosoftAction,
  decideMcpConsentAction,
  requestMagicLinkAction,
  requestPasswordResetAction,
  signInWithEmailAction,
  resendVerificationEmailFromAuthAction,
  resetPasswordAction,
  signUpWithEmailAction,
} from "../actions";

describe("authentication action adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockReset();
    mocks.refuseBots.mockResolvedValue(null);
    mocks.magicLink.mockResolvedValue({ ok: true, data: { email: "user@example.com" } });
    mocks.requestPasswordReset.mockResolvedValue({ ok: true, data: null });
    mocks.resendVerification.mockResolvedValue({ ok: true });
    mocks.resetPassword.mockResolvedValue({ ok: true, data: null });
    mocks.signUp.mockResolvedValue({ ok: true, data: null });
  });

  it.each([
    ["google", continueWithGoogleAction],
    ["microsoft", continueWithMicrosoftAction],
  ] as const)("redirects %s on the server before rendering the old auth page", async (provider, invoke) => {
    const destination = `https://${provider}.example/authorize`;
    const redirected = new Error("NEXT_REDIRECT");
    mocks.social.mockResolvedValue({ redirect: destination });
    mocks.redirect.mockImplementation(() => {
      throw redirected;
    });

    await expect(
      invoke("/auth/invitation?intent=synthetic.intent", "/auth/signin?intent=synthetic.intent"),
    ).rejects.toBe(redirected);

    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(destination);
    expect(mocks.social).toHaveBeenCalledExactlyOnceWith({
      provider,
      callbackURL: "/auth/invitation?intent=synthetic.intent",
      errorCallbackURL: "/auth/signin?intent=synthetic.intent",
    });
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
    await resendVerificationEmailFromAuthAction({ onboardingIntent: "signed.intent" });

    expect(mocks.requestPasswordReset).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.resetPassword).toHaveBeenCalledExactlyOnceWith(reset);
    expect(mocks.resendVerification).toHaveBeenCalledExactlyOnceWith({ onboardingIntent: "signed.intent" });
  });

  it("passes a sign-in link request to its interactor", async () => {
    const data = { email: "user@example.com", callbackURL: "/auth/invitation?intent=signed.intent" };

    await expect(requestMagicLinkAction(data)).resolves.toEqual({ ok: true, data: { email: "user@example.com" } });

    expect(mocks.magicLink).toHaveBeenCalledExactlyOnceWith(data);
  });

  it("refuses a bot before any interactor runs", async () => {
    const refusal = { ok: false, error: { errors: ["Common.errors.botDetected"] } };
    mocks.refuseBots.mockResolvedValue(refusal);

    await expect(signInWithEmailAction({ email: "a@example.com", password: "x", rememberMe: true })).resolves.toBe(
      refusal,
    );
    await expect(
      signUpWithEmailAction({
        confirmEmail: "a@example.com",
        confirmPassword: "ValidPass1!",
        email: "a@example.com",
        password: "ValidPass1!",
      }),
    ).resolves.toBe(refusal);
    await expect(requestMagicLinkAction({ email: "a@example.com" })).resolves.toBe(refusal);
    await expect(requestPasswordResetAction({ email: "a@example.com", confirmEmail: "a@example.com" })).resolves.toBe(
      refusal,
    );
    await expect(decideMcpConsentAction({ consentCode: "code", accept: true })).resolves.toBe(refusal);

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.magicLink).not.toHaveBeenCalled();
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
    expect(mocks.decideMcp).not.toHaveBeenCalled();
  });
});
