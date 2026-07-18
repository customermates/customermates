import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () =>
    new Headers({
      host: "feat-inbox.customermates.com",
      "x-forwarded-proto": "https",
    }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("@/core/auth/better-auth", () => ({
  auth: {
    api: {
      signInEmail: mocks.signInEmail,
      signInSocial: mocks.signInSocial,
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

describe("AuthService callback URLs", () => {
  const service = new AuthService({ send: vi.fn() } as never);

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("lets the OAuth proxy infer Preview origin when social sign-in has no callback", async () => {
    await service.continueWithSocials({ provider: "google" });

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        provider: "google",
        errorCallbackURL: "/auth/signin",
      },
    });
  });

  it("preserves explicit social callback and error URLs", async () => {
    await service.continueWithSocials({
      provider: "microsoft",
      callbackURL: "https://feat-inbox.customermates.com/en/inbox",
      errorCallbackURL: "https://feat-inbox.customermates.com/en/auth/signin",
    });

    expect(mocks.signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          provider: "microsoft",
          callbackURL: "https://feat-inbox.customermates.com/en/inbox",
          errorCallbackURL: "https://feat-inbox.customermates.com/en/auth/signin",
        },
      }),
    );
  });
});
