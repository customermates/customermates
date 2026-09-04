import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getTranslations: vi.fn().mockResolvedValue(
    Object.assign((key: string) => key, {
      raw: (key: string) => key,
    }),
  ),
}));

import { RequestPasswordResetInteractor } from "../request-password-reset.interactor";
import { ResendVerificationEmailInteractor } from "../resend-verification-email.interactor";

describe("onboarding authentication detours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the intent-preserving reset destination after validation", async () => {
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
    const interactor = new RequestPasswordResetInteractor({ requestPasswordReset } as unknown as AuthService);
    const data = { email: "invited@example.com", confirmEmail: "invited@example.com" };

    await expect(interactor.invoke(data, "/auth/reset-password?intent=signed.intent")).resolves.toEqual({
      ok: true,
      data,
    });
    expect(requestPasswordReset).toHaveBeenCalledWith(
      "invited@example.com",
      "/auth/reset-password?intent=signed.intent",
    );
  });

  it("passes the intent-preserving verification callback while keeping the session", async () => {
    const resendVerificationEmail = vi.fn().mockResolvedValue(undefined);
    const interactor = new ResendVerificationEmailInteractor({
      getSession: vi.fn().mockResolvedValue({ user: { email: "invited@example.com" } }),
      resendVerificationEmail,
    } as unknown as AuthService);

    await expect(interactor.invoke("/auth/invitation?intent=signed.intent")).resolves.toEqual({ ok: true });
    expect(resendVerificationEmail).toHaveBeenCalledWith("invited@example.com", {
      callbackURL: "/auth/invitation?intent=signed.intent",
      keepSession: true,
    });
  });
});
