import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getTranslations: vi.fn().mockResolvedValue(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { RequestPasswordResetInteractor } from "../request-password-reset.interactor";
import { ResendVerificationEmailInteractor } from "../resend-verification-email.interactor";
import { ResetPasswordInteractor } from "../reset-password.interactor";
import { SignOutInteractor } from "../sign-out.interactor";
import { SignUpWithEmailInteractor } from "../sign-up-with-email.interactor";

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

describe("onboarding authentication detours", () => {
  const onboardingIntentService = { resolve: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    onboardingIntentService.resolve.mockResolvedValue(invitation);
  });

  it("derives the intent-preserving reset destination after validation", async () => {
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
    const interactor = new RequestPasswordResetInteractor(
      { requestPasswordReset } as unknown as AuthService,
      onboardingIntentService as never,
    );
    const data = { email: "invited@example.com", confirmEmail: "invited@example.com" };

    await expect(interactor.invoke(data, invitation.intent)).resolves.toEqual({ ok: true, data });
    expect(requestPasswordReset).toHaveBeenCalledWith(
      "invited@example.com",
      "/auth/reset-password?intent=signed.intent",
    );
  });

  it("derives both reset-password continuations from the validated intent", async () => {
    const resetPassword = vi.fn().mockRejectedValue(new Error("invalid token"));
    const interactor = new ResetPasswordInteractor(
      { resetPassword } as unknown as AuthService,
      onboardingIntentService as never,
    );
    const data = { confirmPassword: "ValidPass1!", password: "ValidPass1!", token: "reset-token" };

    await expect(interactor.invoke(data, invitation.intent)).resolves.toEqual({
      redirect: "/auth/forgot-password?info=RESET_LINK_INVALID&intent=signed.intent",
    });
  });

  it("derives the exact verification callback while keeping the session", async () => {
    const resendVerificationEmail = vi.fn().mockResolvedValue(undefined);
    const interactor = new ResendVerificationEmailInteractor(
      {
        getSession: vi.fn().mockResolvedValue({ user: { email: "invited@example.com" } }),
        resendVerificationEmail,
      } as unknown as AuthService,
      onboardingIntentService as never,
    );

    await expect(interactor.invoke(invitation.intent)).resolves.toEqual({ ok: true });
    expect(resendVerificationEmail).toHaveBeenCalledWith("invited@example.com", {
      callbackURL: "/auth/invitation?intent=signed.intent",
      keepSession: true,
    });
  });

  it("ignores an invalid intent for password recovery", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      errorMessage: "onboardingSessionExpired",
      source: "explicit",
      status: "invalid",
    });
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
    const interactor = new RequestPasswordResetInteractor(
      { requestPasswordReset } as unknown as AuthService,
      onboardingIntentService as never,
    );

    await interactor.invoke({ confirmEmail: "invited@example.com", email: "invited@example.com" }, "expired.intent");

    expect(requestPasswordReset).toHaveBeenCalledWith("invited@example.com", undefined);
  });

  it("accepts only invitation intent on account signup", async () => {
    const registerWithEmail = vi.fn().mockResolvedValue({ ok: true });
    const interactor = new SignUpWithEmailInteractor(
      { registerWithEmail } as unknown as AuthService,
      onboardingIntentService as never,
    );
    const data = {
      confirmEmail: "invited@example.com",
      confirmPassword: "ValidPass1!",
      email: "invited@example.com",
      password: "ValidPass1!",
    };

    await expect(interactor.invoke(data, invitation.intent)).resolves.toEqual({
      redirect: "/auth/invitation?intent=signed.intent",
    });
    expect(registerWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/auth/invitation?intent=signed.intent" }),
    );

    onboardingIntentService.resolve.mockResolvedValue({
      authUserId: "auth-user-one",
      intent: "signed.create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });
    await expect(interactor.invoke(data, "signed.create")).resolves.toEqual({
      redirect: "/auth/error?type=invalidOnboardingIntent",
    });
    expect(registerWithEmail).toHaveBeenCalledOnce();
  });

  it("clears invitation state and signs out before returning the validated destination", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    const interactor = new SignOutInteractor(
      { signOut } as unknown as AuthService,
      onboardingIntentService as never,
      { clear } as never,
    );

    await expect(interactor.invoke({ invitationIntent: invitation.intent })).resolves.toEqual({
      redirect: "/auth/signup?intent=signed.intent",
    });
    expect(clear).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it("still signs out when the invitation intent is invalid", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      errorMessage: "invalidOnboardingIntent",
      source: "explicit",
      status: "invalid",
    });
    const signOut = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    const interactor = new SignOutInteractor(
      { signOut } as unknown as AuthService,
      onboardingIntentService as never,
      { clear } as never,
    );

    await expect(interactor.invoke({ invitationIntent: "tampered" })).resolves.toEqual({
      redirect: "/auth/error?type=invalidOnboardingIntent",
    });
    expect(signOut).toHaveBeenCalledOnce();
  });
});
