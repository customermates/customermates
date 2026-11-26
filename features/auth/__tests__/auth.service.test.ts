import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError, BASE_ERROR_CODES } from "better-auth";
import { API_KEY_ERROR_CODES } from "@better-auth/api-key";

const mocks = vi.hoisted(() => ({
  locale: "en",
  send: vi.fn(),
  createApiKey: vi.fn(),
  bindApiKeyToCompany: vi.fn().mockResolvedValue(true),
  deleteApiKey: vi.fn(),
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: vi.fn(),
  deleteCookie: vi.fn(),
  verifyEmailOTP: vi.fn(),
  sendVerificationOTP: vi.fn(),
  verificationCreate: vi.fn(),
  verificationCount: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ delete: mocks.deleteCookie }),
  headers: () =>
    new Headers({
      host: "feat-inbox.customermates.com",
      origin: "https://feat-inbox.customermates.com",
      "x-forwarded-proto": "https",
    }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve(mocks.locale),
  getTranslations: () => Promise.resolve((key: string) => `${mocks.locale}:${key}`),
}));
vi.mock("@/core/auth/better-auth", () => ({
  bindApiKeyToCompany: mocks.bindApiKeyToCompany,
  auth: {
    api: {
      signInEmail: mocks.signInEmail,
      signInSocial: mocks.signInSocial,
      signUpEmail: mocks.signUpEmail,
      signOut: mocks.signOut,
      createApiKey: mocks.createApiKey,
      deleteApiKey: mocks.deleteApiKey,
      verifyEmailOTP: mocks.verifyEmailOTP,
      sendVerificationOTP: mocks.sendVerificationOTP,
    },
  },
}));
vi.mock("@/prisma/db", () => ({
  prisma: { authVerification: { create: mocks.verificationCreate, count: mocks.verificationCount } },
}));
vi.mock("@/core/decorators/tenant-context", () => ({
  runWithoutTenant: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
    RESEND_OPERATOR_EMAIL: "mail@example.com",
  },
}));

import { AuthService } from "@/features/auth/auth.service";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";

describe("AuthService", () => {
  const service = new AuthService({ send: mocks.send } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue(true);
    mocks.locale = "en";
    mocks.signInEmail.mockResolvedValue({
      user: {
        id: "user-id",
        email: "max@example.com",
        name: "Max",
        emailVerified: true,
      },
    });
    mocks.signInSocial.mockResolvedValue({
      redirect: true,
      url: "https://accounts.example.com",
    });
    mocks.createApiKey.mockResolvedValue({ id: "key-id", key: "one-time-secret" });
  });

  it("drops the session hint with the session, so a cached marketing page stops asking for the account", async () => {
    await service.signOut();

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.deleteCookie).toHaveBeenCalledWith("app.session_hint");
  });

  it("lets Better Auth infer the current request origin when email sign-in has no callback", async () => {
    await service.signInWithEmail({
      email: "max@example.com",
      password: "password",
      rememberMe: true,
    });

    expect(mocks.signInEmail).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        email: "max@example.com",
        password: "password",
        rememberMe: true,
      },
    });
  });

  it("preserves an explicitly validated email callback", async () => {
    await service.signInWithEmail({
      email: "max@example.com",
      password: "password",
      rememberMe: true,
      callbackURL: "https://feat-inbox.customermates.com/en/dashboard",
    });

    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          callbackURL: "https://feat-inbox.customermates.com/en/dashboard",
        }),
      }),
    );
  });

  it("gives the OAuth proxy the current request origin and a safe default callback", async () => {
    await service.continueWithSocials({ provider: "google" });

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      request: expect.any(Request),
      headers: expect.any(Headers),
      asResponse: false,
      body: {
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/auth/signin",
      },
    });
    expect(mocks.signInSocial.mock.calls[0][0].request.url).toBe(
      "https://feat-inbox.customermates.com/api/auth/sign-in/social",
    );
  });

  it("preserves explicit social callback and error URLs", async () => {
    await service.continueWithSocials({
      provider: "microsoft",
      callbackURL: "https://feat-inbox.customermates.com/en/inbox",
      errorCallbackURL: "https://feat-inbox.customermates.com/en/auth/signin",
    });

    expect(mocks.signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.any(Request),
        body: {
          provider: "microsoft",
          callbackURL: "https://feat-inbox.customermates.com/en/inbox",
          errorCallbackURL: "https://feat-inbox.customermates.com/en/auth/signin",
        },
      }),
    );
  });

  it("constructs the confirmation code email in the request application locale, without a link", async () => {
    mocks.locale = "it";

    await service.sendVerificationCodeEmail({ to: "max@example.com", code: "482913" });

    const message = mocks.send.mock.calls[0][0];
    expect(message.subject).toBe("it:VerifyEmail.subject");
    expect(message.react.props).not.toHaveProperty("url");
    expect(message.react.props).toMatchObject({
      code: "482913",
      locale: "it",
      layoutCopy: {
        country: "Germania",
        tagline: "Il CRM source-available per seguire ogni cliente",
      },
    });
  });

  it("checks a confirmation code with the caller's session headers, so better-auth sees the signed-in browser", async () => {
    mocks.verifyEmailOTP.mockResolvedValue({ status: true, token: null, user: {} });

    await expect(service.verifyEmailCode("max@example.com", "482913")).resolves.toEqual({ ok: true });

    expect(mocks.verifyEmailOTP).toHaveBeenCalledExactlyOnceWith({
      headers: expect.any(Headers),
      body: { email: "max@example.com", otp: "482913" },
    });
  });

  it.each([
    ["INVALID_OTP", "BAD_REQUEST", "invalid"],
    ["OTP_EXPIRED", "BAD_REQUEST", "expired"],
    ["TOO_MANY_ATTEMPTS", "FORBIDDEN", "tooManyAttempts"],
  ] as const)("maps better-auth's %s refusal to %s", async (code, status, error) => {
    mocks.verifyEmailOTP.mockRejectedValue(new APIError(status, { code, message: code }));

    await expect(service.verifyEmailCode("max@example.com", "482913")).resolves.toEqual({ ok: false, error });
  });

  it("rethrows an unexpected failure instead of calling it a wrong code", async () => {
    const failure = new Error("database down");
    mocks.verifyEmailOTP.mockRejectedValue(failure);

    await expect(service.verifyEmailCode("max@example.com", "482913")).rejects.toBe(failure);
  });

  it("sends a confirmation code while the address is under its hourly limit", async () => {
    mocks.verificationCount.mockResolvedValue(5);

    await expect(service.sendVerificationCode("Max@Example.com")).resolves.toBe("sent");

    expect(mocks.verificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ identifier: "email-code-sent:max@example.com" }),
    });
    expect(mocks.sendVerificationOTP).toHaveBeenCalledExactlyOnceWith({
      body: { email: "Max@Example.com", type: "email-verification" },
    });
  });

  it("stops after five codes per address in an hour and does not replace the code already sent", async () => {
    mocks.verificationCount.mockResolvedValue(6);

    await expect(service.sendVerificationCode("max@example.com")).resolves.toBe("rateLimited");

    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("constructs reset email content in the request application locale", async () => {
    mocks.locale = "fr";

    await service.sendResetPasswordEmail({ to: "max@example.com", url: "http://localhost:4000/reset" });

    const message = mocks.send.mock.calls[0][0];
    expect(message.subject).toBe("fr:ResetPassword.subject");
    expect(message.react.props).toMatchObject({
      locale: "fr",
      layoutCopy: {
        country: "Allemagne",
        tagline: "Le CRM source-available pour relancer vos clients",
      },
    });
  });

  it("keeps operator notifications on the explicit default layout", async () => {
    mocks.locale = "it";

    await service.sendNewUserNotificationEmail({ email: "max@example.com", name: "Max" });

    expect(mocks.send.mock.calls[0][0].react.props).toMatchObject({
      locale: DEFAULT_LOCALE,
      layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
    });
  });

  it("forwards an absent expiration without inventing one", async () => {
    const result = await service.createApiKey({
      name: "Synthetic integration",
      expiresIn: undefined,
      companyId: "company-1",
    });

    expect(result).toEqual({ ok: true, data: { id: "key-id", key: "one-time-secret" } });
    expect(mocks.createApiKey).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { name: "Synthetic integration", expiresIn: undefined },
    });
  });

  it("binds a new key to the workspace it was created in", async () => {
    mocks.createApiKey.mockResolvedValueOnce({ id: "key-id", key: "one-time-secret", referenceId: "auth-user" });

    await service.createApiKey({ name: "Synthetic integration", companyId: "company-1" });

    expect(mocks.bindApiKeyToCompany).toHaveBeenCalledWith("key-id", "auth-user", "company-1");
  });

  it("removes a new key that could not be bound to its workspace", async () => {
    mocks.createApiKey.mockResolvedValueOnce({ id: "key-id", key: "one-time-secret", referenceId: "auth-user" });
    mocks.bindApiKeyToCompany.mockResolvedValueOnce(false);

    await expect(service.createApiKey({ name: "Synthetic integration", companyId: "company-1" })).rejects.toThrow(
      "API key could not be bound to its workspace",
    );
    expect(mocks.deleteApiKey).toHaveBeenCalledWith({ body: { keyId: "key-id" }, headers: expect.any(Headers) });
  });

  it.each([
    [API_KEY_ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL, CustomErrorCode.apiKeyMinExpiration],
    [API_KEY_ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE, CustomErrorCode.apiKeyMaxExpiration],
    [API_KEY_ERROR_CODES.INVALID_NAME_LENGTH, CustomErrorCode.apiKeyNameLength],
  ])("maps Better Auth API-key boundaries to %s", async (providerError, error) => {
    mocks.createApiKey.mockRejectedValueOnce(APIError.from("BAD_REQUEST", providerError));

    await expect(
      service.createApiKey({ name: "Synthetic integration", expiresIn: 24 * 60 * 60, companyId: "company-1" }),
    ).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it.each([
    APIError.from("BAD_REQUEST", API_KEY_ERROR_CODES.INVALID_METADATA_TYPE),
    new Error("unexpected auth failure"),
  ])("rethrows an unrelated API-key creation failure", async (error) => {
    mocks.createApiKey.mockRejectedValueOnce(error);

    await expect(service.createApiKey({ name: "Synthetic integration", companyId: "company-1" })).rejects.toBe(error);
  });

  it.each([BASE_ERROR_CODES.PASSWORD_TOO_SHORT, BASE_ERROR_CODES.PASSWORD_TOO_LONG])(
    "maps the Better Auth password length boundary %s to the password rule",
    async (providerError) => {
      mocks.signUpEmail.mockRejectedValueOnce(APIError.from("BAD_REQUEST", providerError));

      await expect(
        service.registerWithEmail({ email: "max@example.com", name: "max@example.com", password: "Synthetic1!" }),
      ).resolves.toEqual({ ok: false, error: CustomErrorCode.passwordInvalid });
    },
  );
});
