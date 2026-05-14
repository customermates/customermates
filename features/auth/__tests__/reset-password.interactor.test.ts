import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { ResetPasswordInteractor } from "../reset-password.interactor";
import { isRedirect } from "../auth-outcome";

describe("ResetPasswordInteractor (validation flow)", () => {
  let authService: { resetPassword: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authService = { resetPassword: vi.fn().mockResolvedValue(undefined) };
  });

  it("returns ok:false zod error when passwords do not match — NOT a Redirect", async () => {
    const interactor = new ResetPasswordInteractor(authService as never);

    const result = await interactor.invoke({
      password: "ValidPass1!",
      confirmPassword: "DifferentPass1!",
      token: "tok-123",
    });

    expect(isRedirect(result)).toBe(false);
    expect(result).toMatchObject({ ok: false });
    expect(authService.resetPassword).not.toHaveBeenCalled();

    if (!isRedirect(result) && result.ok === false) expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("returns Redirect to /auth/signin on successful reset", async () => {
    const interactor = new ResetPasswordInteractor(authService as never);

    const result = await interactor.invoke({
      password: "ValidPass1!",
      confirmPassword: "ValidPass1!",
      token: "tok-123",
    });

    expect(result).toEqual({ redirect: "/auth/signin" });
    expect(authService.resetPassword).toHaveBeenCalledTimes(1);
  });

  it("returns Redirect to forgot-password when auth service throws (invalid token)", async () => {
    authService.resetPassword.mockRejectedValueOnce(new Error("invalid token"));
    const interactor = new ResetPasswordInteractor(authService as never);

    const result = await interactor.invoke({
      password: "ValidPass1!",
      confirmPassword: "ValidPass1!",
      token: "bad-token",
    });

    expect(result).toEqual({ redirect: "/auth/forgot-password?info=RESET_LINK_INVALID" });
  });
});
