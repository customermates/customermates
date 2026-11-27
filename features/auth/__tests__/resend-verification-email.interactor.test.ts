import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));

import { ResendVerificationEmailInteractor } from "../resend-verification-email.interactor";

function buildInteractor(session: { email: string; emailVerified?: boolean } | null) {
  const sendVerificationCode = vi.fn().mockResolvedValue("sent");
  const getInteractiveSession = vi
    .fn()
    .mockResolvedValue(
      session ? { user: { email: session.email, emailVerified: session.emailVerified ?? false } } : null,
    );
  const interactor = new ResendVerificationEmailInteractor({
    getInteractiveSession,
    sendVerificationCode,
  } as unknown as AuthService);

  return { interactor, sendVerificationCode };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResendVerificationEmailInteractor", () => {
  it("sends a new code only to the address of the signed-in browser session", async () => {
    const { interactor, sendVerificationCode } = buildInteractor({ email: "owner@example.com" });

    await expect(interactor.invoke()).resolves.toEqual({ ok: true });
    expect(sendVerificationCode).toHaveBeenCalledExactlyOnceWith("owner@example.com");
  });

  it("refuses without a browser session, so nobody can trigger mail to an arbitrary address", async () => {
    const { interactor, sendVerificationCode } = buildInteractor(null);

    await expect(interactor.invoke()).resolves.toEqual({ ok: false, error: "signedOut" });
    expect(sendVerificationCode).not.toHaveBeenCalled();
  });

  it("sends nothing to an address that is already confirmed", async () => {
    const { interactor, sendVerificationCode } = buildInteractor({ email: "owner@example.com", emailVerified: true });

    await expect(interactor.invoke()).resolves.toEqual({ ok: true });
    expect(sendVerificationCode).not.toHaveBeenCalled();
  });

  it("reports the hourly send limit instead of claiming a code went out", async () => {
    const { interactor, sendVerificationCode } = buildInteractor({ email: "owner@example.com" });
    sendVerificationCode.mockResolvedValue("rateLimited");

    await expect(interactor.invoke()).resolves.toEqual({ ok: false, error: "rateLimited" });
  });

  it("reports a failed send instead of claiming success", async () => {
    const { interactor, sendVerificationCode } = buildInteractor({ email: "owner@example.com" });
    sendVerificationCode.mockRejectedValue(new Error("mail provider down"));

    await expect(interactor.invoke()).resolves.toEqual({ ok: false, error: "failed" });
  });
});
