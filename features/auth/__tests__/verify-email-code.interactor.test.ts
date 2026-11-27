import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailCodeInteractor } from "../verify-email-code.interactor";

function buildInteractor(session: { email: string; emailVerified?: boolean } | null) {
  const verifyEmailCode = vi.fn().mockResolvedValue({ ok: true });
  const getInteractiveSession = vi
    .fn()
    .mockResolvedValue(
      session ? { user: { email: session.email, emailVerified: session.emailVerified ?? false } } : null,
    );
  const interactor = new VerifyEmailCodeInteractor({
    getInteractiveSession,
    verifyEmailCode,
  } as unknown as AuthService);

  return { interactor, verifyEmailCode, getInteractiveSession };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VerifyEmailCodeInteractor", () => {
  it("checks the code against the address of the signed-in browser session, never one the caller names", async () => {
    const { interactor, verifyEmailCode } = buildInteractor({ email: "owner@example.com" });

    await expect(
      interactor.invoke({ code: "123456", email: "victim@example.com" } as unknown as { code: string }),
    ).resolves.toEqual({ ok: true });
    expect(verifyEmailCode).toHaveBeenCalledExactlyOnceWith("owner@example.com", "123456");
  });

  it("refuses without a browser session, so a code alone confirms nothing", async () => {
    const { interactor, verifyEmailCode } = buildInteractor(null);

    await expect(interactor.invoke({ code: "123456" })).resolves.toEqual({ ok: false, error: "signedOut" });
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("accepts a pasted code with spaces or dashes", async () => {
    const { interactor, verifyEmailCode } = buildInteractor({ email: "owner@example.com" });

    await interactor.invoke({ code: " 123-456 " });

    expect(verifyEmailCode).toHaveBeenCalledExactlyOnceWith("owner@example.com", "123456");
  });

  it.each(["12345", "abcdef", "", "12 34"])("rejects %j without spending an attempt", async (code) => {
    const { interactor, verifyEmailCode } = buildInteractor({ email: "owner@example.com" });

    await expect(interactor.invoke({ code })).resolves.toEqual({ ok: false, error: "invalid" });
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("rejects a value that is not text", async () => {
    const { interactor, verifyEmailCode } = buildInteractor({ email: "owner@example.com" });

    await expect(interactor.invoke({ code: 123456 } as unknown as { code: string })).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("treats an already confirmed address as done", async () => {
    const { interactor, verifyEmailCode } = buildInteractor({ email: "owner@example.com", emailVerified: true });

    await expect(interactor.invoke({ code: "000000" })).resolves.toEqual({ ok: true });
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired", "tooManyAttempts"] as const)("passes the %s outcome through", async (error) => {
    const { interactor, verifyEmailCode } = buildInteractor({ email: "owner@example.com" });
    verifyEmailCode.mockResolvedValue({ ok: false, error });

    await expect(interactor.invoke({ code: "123456" })).resolves.toEqual({ ok: false, error });
  });
});
