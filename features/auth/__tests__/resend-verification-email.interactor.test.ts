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

describe("ResendVerificationEmailInteractor without a session", () => {
  it("sends to the address the visitor supplied", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor();

    await expect(interactor.invoke({ email: "  Stuck.User@Gmail.com " })).resolves.toEqual({ ok: true });
    expect(resendVerificationEmail).toHaveBeenCalledExactlyOnceWith("stuck.user@gmail.com", {
      callbackURL: undefined,
      keepSession: true,
    });
  });

  it("refuses an address that is not an email", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor();

    await expect(interactor.invoke({ email: "not-an-email" })).resolves.toEqual({ ok: false });
    expect(resendVerificationEmail).not.toHaveBeenCalled();
  });

  it("refuses when no address is supplied at all", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor();

    await expect(interactor.invoke()).resolves.toEqual({ ok: false });
    expect(resendVerificationEmail).not.toHaveBeenCalled();
  });

  it("reports the same outcome when the send fails, so the address cannot be probed", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor();
    resendVerificationEmail.mockRejectedValue(new Error("user not found"));

    await expect(interactor.invoke({ email: "stranger@example.com" })).resolves.toEqual({ ok: true });
  });

  it("ignores a supplied address while a session is present", async () => {
    const { interactor, resendVerificationEmail } = buildInteractor("owner@example.com");

    await expect(interactor.invoke({ email: "attacker@example.com" })).resolves.toEqual({ ok: true });
    expect(resendVerificationEmail).toHaveBeenCalledExactlyOnceWith("owner@example.com", {
      callbackURL: undefined,
      keepSession: true,
    });
  });
});
