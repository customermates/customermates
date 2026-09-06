import type { AuthService } from "../auth.service";
import type { FindUserRepo } from "@/features/user/user.service";

import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("de"),
  getTranslations: vi.fn().mockResolvedValue(
    Object.assign((key: string) => key, {
      raw: (key: string) => key,
    }),
  ),
}));

import { ContinueWithSocialsInteractor } from "../continue-with-socials.interactor";

describe("ContinueWithSocialsInteractor callback validation", () => {
  it.each(["google", "microsoft"] as const)(
    "rejects an external callback before invoking the %s auth provider",
    async (provider) => {
      const continueWithSocials = vi.fn();
      const interactor = new ContinueWithSocialsInteractor(
        { continueWithSocials } as unknown as AuthService,
        { findCurrentUserUnscoped: vi.fn() } as unknown as FindUserRepo,
      );

      const result = await interactor.invoke({
        provider,
        callbackURL: "https://malicious.example/collect-session",
        errorCallbackURL: "/de/auth/error",
      });

      expect(result).toMatchObject({ ok: false });
      if ("ok" in result && !result.ok) expect(result.error.issues[0].message).toBe("Common.errors.invalidCallbackUrl");
      expect(continueWithSocials).not.toHaveBeenCalled();
    },
  );

  it("rejects an unsupported provider before invoking the auth service", async () => {
    const continueWithSocials = vi.fn();
    const interactor = new ContinueWithSocialsInteractor(
      { continueWithSocials } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn() } as unknown as FindUserRepo,
    );

    const result = await interactor.invoke({ provider: "github" } as never);

    expect(result).toMatchObject({ ok: false });
    expect(continueWithSocials).not.toHaveBeenCalled();
  });

  it.each(["google", "microsoft"] as const)("passes valid %s input to the auth service", async (provider) => {
    const continueWithSocials = vi.fn().mockResolvedValue({ redirect: false });
    const interactor = new ContinueWithSocialsInteractor(
      { continueWithSocials } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn() } as unknown as FindUserRepo,
    );

    await expect(interactor.invoke({ provider })).resolves.toEqual({ ok: true, data: null });
    expect(continueWithSocials).toHaveBeenCalledWith({ provider });
  });

  it("returns the provider redirect", async () => {
    const interactor = new ContinueWithSocialsInteractor(
      {
        continueWithSocials: vi.fn().mockResolvedValue({ redirect: true, url: "/it/inbox" }),
      } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn() } as unknown as FindUserRepo,
    );

    await expect(interactor.invoke({ provider: "google" })).resolves.toEqual({ redirect: "/it/inbox" });
  });

  it("notifies operators once for a newly authenticated user", async () => {
    const sendNewUserNotificationEmail = vi.fn();
    const interactor = new ContinueWithSocialsInteractor(
      {
        continueWithSocials: vi.fn().mockResolvedValue({
          redirect: false,
          user: {
            createdAt: new Date(),
            email: "new@example.com",
            emailVerified: true,
            name: "New User",
          },
        }),
        sendNewUserNotificationEmail,
      } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn().mockResolvedValue(null) } as unknown as FindUserRepo,
    );

    await interactor.invoke({ provider: "microsoft" });

    expect(sendNewUserNotificationEmail).toHaveBeenCalledOnce();
    expect(sendNewUserNotificationEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      name: "New User",
      provider: "microsoft",
    });
  });

  it("does not notify operators for an existing user", async () => {
    const sendNewUserNotificationEmail = vi.fn();
    const interactor = new ContinueWithSocialsInteractor(
      {
        continueWithSocials: vi.fn().mockResolvedValue({
          redirect: false,
          user: {
            createdAt: new Date(),
            email: "existing@example.com",
            emailVerified: true,
            name: "Existing User",
          },
        }),
        sendNewUserNotificationEmail,
      } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn().mockResolvedValue({ id: "user-id" }) } as unknown as FindUserRepo,
    );

    await interactor.invoke({ provider: "google" });

    expect(sendNewUserNotificationEmail).not.toHaveBeenCalled();
  });

  it("redirects a user outside the verification grace period", async () => {
    const interactor = new ContinueWithSocialsInteractor(
      {
        continueWithSocials: vi.fn().mockResolvedValue({
          redirect: false,
          user: {
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            email: "unverified@example.com",
            emailVerified: false,
            name: "Unverified User",
          },
        }),
        sendNewUserNotificationEmail: vi.fn(),
      } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn().mockResolvedValue({ id: "user-id" }) } as unknown as FindUserRepo,
    );

    await expect(interactor.invoke({ provider: "google" })).resolves.toEqual({ redirect: "/auth/verify-email" });
  });

  it("preserves onboarding intent across social email verification", async () => {
    const interactor = new ContinueWithSocialsInteractor(
      {
        continueWithSocials: vi.fn().mockResolvedValue({
          redirect: false,
          user: {
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            email: "unverified@example.com",
            emailVerified: false,
            name: "Unverified User",
          },
        }),
        sendNewUserNotificationEmail: vi.fn(),
      } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn().mockResolvedValue({ id: "user-id" }) } as unknown as FindUserRepo,
    );

    await expect(
      interactor.invoke({
        callbackURL: "/auth/invitation?intent=signed.intent",
        provider: "microsoft",
      }),
    ).resolves.toEqual({ redirect: "/auth/verify-email?intent=signed.intent" });
  });

  it("fails closed when a social verification callback contains duplicate intents", async () => {
    const interactor = new ContinueWithSocialsInteractor(
      {
        continueWithSocials: vi.fn().mockResolvedValue({
          redirect: false,
          user: {
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            email: "unverified@example.com",
            emailVerified: false,
            name: "Unverified User",
          },
        }),
        sendNewUserNotificationEmail: vi.fn(),
      } as unknown as AuthService,
      { findCurrentUserUnscoped: vi.fn().mockResolvedValue({ id: "user-id" }) } as unknown as FindUserRepo,
    );

    await expect(
      interactor.invoke({
        callbackURL: "/auth/invitation?intent=one&intent=two",
        provider: "microsoft",
      }),
    ).resolves.toEqual({ redirect: "/auth/error?type=invalidOnboardingIntent" });
  });
});
