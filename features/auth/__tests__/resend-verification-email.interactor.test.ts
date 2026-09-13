import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResendVerificationEmailInteractor } from "../resend-verification-email.interactor";

const onboardingIntentService = { resolve: vi.fn() };

function buildInteractor(sessionEmail?: string) {
  const resendVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const sendVerificationEmailForAddress = vi.fn().mockResolvedValue(true);
  const interactor = new ResendVerificationEmailInteractor(
    {
      getSession: vi.fn().mockResolvedValue(sessionEmail ? { user: { email: sessionEmail } } : null),
      resendVerificationEmail,
      sendVerificationEmailForAddress,
    } as unknown as AuthService,
    onboardingIntentService as never,
  );

  return { interactor, resendVerificationEmail, sendVerificationEmailForAddress };
}

beforeEach(() => {
  vi.clearAllMocks();
  onboardingIntentService.resolve.mockResolvedValue({ source: "absent", status: "absent" });
});

describe("ResendVerificationEmailInteractor without a session", () => {
  it("sends to the address the visitor supplied", async () => {
    const { interactor, sendVerificationEmailForAddress } = buildInteractor();

    await expect(interactor.invoke({ email: "  Stuck.User@Gmail.com " })).resolves.toEqual({ ok: true });
    expect(sendVerificationEmailForAddress).toHaveBeenCalledExactlyOnceWith("stuck.user@gmail.com", undefined);
  });

  it("refuses an address that is not an email", async () => {
    const { interactor, sendVerificationEmailForAddress } = buildInteractor();

    await expect(interactor.invoke({ email: "not-an-email" })).resolves.toEqual({ ok: false });
    expect(sendVerificationEmailForAddress).not.toHaveBeenCalled();
  });

  it("refuses when no address is supplied at all", async () => {
    const { interactor, sendVerificationEmailForAddress } = buildInteractor();

    await expect(interactor.invoke()).resolves.toEqual({ ok: false });
    expect(sendVerificationEmailForAddress).not.toHaveBeenCalled();
  });

  it("never inspects whether the address exists, so it cannot be probed", async () => {
    const { interactor, sendVerificationEmailForAddress } = buildInteractor();

    await interactor.invoke({ email: "stranger@example.com" });
    await interactor.invoke({ email: "member@example.com" });

    expect(sendVerificationEmailForAddress.mock.calls).toEqual([
      ["stranger@example.com", undefined],
      ["member@example.com", undefined],
    ]);
  });

  it("reports failure when the rate-limited endpoint refuses the send", async () => {
    const { interactor, sendVerificationEmailForAddress } = buildInteractor();
    sendVerificationEmailForAddress.mockResolvedValue(false);

    await expect(interactor.invoke({ email: "stuck.user@gmail.com" })).resolves.toEqual({ ok: false });
  });

  it("ignores a supplied address while a session is present", async () => {
    const { interactor, resendVerificationEmail, sendVerificationEmailForAddress } =
      buildInteractor("owner@example.com");

    await expect(interactor.invoke({ email: "attacker@example.com" })).resolves.toEqual({ ok: true });
    expect(sendVerificationEmailForAddress).not.toHaveBeenCalled();
    expect(resendVerificationEmail).toHaveBeenCalledExactlyOnceWith("owner@example.com", {
      callbackURL: undefined,
      keepSession: true,
    });
  });
});
