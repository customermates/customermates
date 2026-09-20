import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResendVerificationEmailInteractor } from "../resend-verification-email.interactor";

const onboardingIntentService = { resolve: vi.fn() };

function buildInteractor(sessionEmail?: string) {
  const resendVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const interactor = new ResendVerificationEmailInteractor(
    {
      getSession: vi.fn().mockResolvedValue(sessionEmail ? { user: { email: sessionEmail } } : null),
      resendVerificationEmail,
    } as unknown as AuthService,
    onboardingIntentService as never,
  );

  return { interactor, resendVerificationEmail };
}

beforeEach(() => {
  vi.clearAllMocks();
  onboardingIntentService.resolve.mockResolvedValue({ source: "absent", status: "absent" });
});

describe("ResendVerificationEmailInteractor", () => {
  it("only sends to the address of the signed-in account", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor("owner@example.com");

    await expect(interactor.invoke()).resolves.toEqual({ ok: true });
    expect(resendVerificationEmail).toHaveBeenCalledExactlyOnceWith("owner@example.com", {
      callbackURL: undefined,
      keepSession: true,
    });
  });

  it("refuses without a session, so nobody can trigger mail to an arbitrary address", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor();

    await expect(interactor.invoke()).resolves.toEqual({ ok: false });
    expect(resendVerificationEmail).not.toHaveBeenCalled();
  });

  it("reports a failed send instead of claiming success", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor("owner@example.com");
    resendVerificationEmail.mockRejectedValue(new Error("mail provider down"));

    await expect(interactor.invoke()).resolves.toEqual({ ok: false });
  });

  it("sends the verification link back into a valid invitation", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      intent: "signed.intent",
      status: "valid",
      type: "invitation",
    });
    const { interactor, resendVerificationEmail } = buildInteractor("invited@example.com");

    await expect(interactor.invoke({ onboardingIntent: "signed.intent" })).resolves.toEqual({ ok: true });
    expect(resendVerificationEmail).toHaveBeenCalledExactlyOnceWith("invited@example.com", {
      callbackURL: "/auth/invitation?intent=signed.intent",
      keepSession: true,
    });
  });
});
