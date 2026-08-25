import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth";
import { API_KEY_ERROR_CODES } from "@better-auth/api-key";

const mocks = vi.hoisted(() => ({
  locale: "en",
  send: vi.fn(),
  createApiKey: vi.fn(),
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock("next/headers", () => ({
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
  auth: {
    api: {
      signInEmail: mocks.signInEmail,
      signInSocial: mocks.signInSocial,
      createApiKey: mocks.createApiKey,
    },
  },
}));
vi.mock("@/prisma/db", () => ({ prisma: {} }));
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

  it("constructs verification email content in the request application locale", async () => {
    mocks.locale = "it";

    await service.sendVerificationEmail({ to: "max@example.com", url: "http://localhost:4000/verify" });

    const message = mocks.send.mock.calls[0][0];
    expect(message.subject).toBe("it:VerifyEmail.subject");
    expect(message.react.props).toMatchObject({
      locale: "it",
      layoutCopy: {
        country: "Germania",
        tagline: "Il CRM agentico open source",
      },
    });
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
        tagline: "Le CRM agentique open source",
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
    const result = await service.createApiKey({ name: "Synthetic integration", expiresIn: undefined });

    expect(result).toEqual({ ok: true, data: { id: "key-id", key: "one-time-secret" } });
    expect(mocks.createApiKey).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { name: "Synthetic integration", expiresIn: undefined },
    });
  });

  it.each([
    [API_KEY_ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL, CustomErrorCode.apiKeyMinExpiration],
    [API_KEY_ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE, CustomErrorCode.apiKeyMaxExpiration],
  ])("maps Better Auth expiration boundaries to %s", async (providerError, error) => {
    mocks.createApiKey.mockRejectedValueOnce(APIError.from("BAD_REQUEST", providerError));

    await expect(service.createApiKey({ name: "Synthetic integration", expiresIn: 24 * 60 * 60 })).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it.each([
    APIError.from("BAD_REQUEST", API_KEY_ERROR_CODES.INVALID_NAME_LENGTH),
    new Error("unexpected auth failure"),
  ])("rethrows an unrelated API-key creation failure", async (error) => {
    mocks.createApiKey.mockRejectedValueOnce(error);

    await expect(service.createApiKey({ name: "Synthetic integration" })).rejects.toBe(error);
  });
});
