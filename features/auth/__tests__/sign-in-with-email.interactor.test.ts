import type { AuthService } from "../auth.service";

import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getTranslations: vi.fn().mockResolvedValue(
    Object.assign((key: string) => key, {
      raw: (key: string) => key,
    }),
  ),
}));

import { SignInWithEmailInteractor } from "../sign-in-with-email.interactor";

describe("SignInWithEmailInteractor", () => {
  it("passes the callback through authentication and returns it as the safe destination", async () => {
    const signInWithEmail = vi.fn().mockResolvedValue({ ok: true, user: { id: "synthetic-user" } });
    const interactor = new SignInWithEmailInteractor({ signInWithEmail } as unknown as AuthService);

    const result = await interactor.invoke({
      email: "synthetic@example.com",
      password: "local-demo-password",
      rememberMe: true,
      callbackURL: "/en/onboarding/wizard",
    });

    expect(signInWithEmail).toHaveBeenCalledWith({
      email: "synthetic@example.com",
      password: "local-demo-password",
      rememberMe: true,
      callbackURL: "/en/onboarding/wizard",
    });
    expect(result).toEqual({ redirect: "/en/onboarding/wizard" });
  });

  it("rejects an external callback before authentication can turn it into a browser destination", async () => {
    const signInWithEmail = vi.fn();
    const interactor = new SignInWithEmailInteractor({ signInWithEmail } as unknown as AuthService);

    const result = await interactor.invoke({
      email: "synthetic@example.com",
      password: "local-demo-password",
      rememberMe: true,
      callbackURL: "https://malicious.example/collect-session",
    });

    expect(result).toMatchObject({ ok: false });
    expect(signInWithEmail).not.toHaveBeenCalled();
  });
});
