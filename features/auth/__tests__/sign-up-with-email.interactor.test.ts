import type { AuthService } from "../auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getTranslations: vi.fn().mockResolvedValue(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { SignUpWithEmailInteractor } from "../sign-up-with-email.interactor";

const onboardingIntentService = { resolve: vi.fn() };

function buildInteractor(args: { error?: string; pendingVerification?: boolean }) {
  const registerWithEmail = vi
    .fn()
    .mockResolvedValue(args.error ? { ok: false, error: args.error } : { ok: true, user: { id: "new-user" } });
  const isEmailPendingVerification = vi.fn().mockResolvedValue(args.pendingVerification ?? false);
  const interactor = new SignUpWithEmailInteractor(
    { registerWithEmail, isEmailPendingVerification } as unknown as AuthService,
    onboardingIntentService as never,
  );

  return { interactor, registerWithEmail, isEmailPendingVerification };
}

const signUpData = {
  email: "stuck.user@gmail.com",
  confirmEmail: "stuck.user@gmail.com",
  password: "CorrectHorse123!",
  confirmPassword: "CorrectHorse123!",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignUpWithEmailInteractor when the account already exists", () => {
  it("sends an unverified account to the verification page instead of a dead-end error", async () => {
    const { interactor } = buildInteractor({ error: "emailAlreadyExists", pendingVerification: true });

    await expect(interactor.invoke(signUpData)).resolves.toEqual({ redirect: "/auth/verify-email" });
  });

  it("carries an invitation along to the verification page", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      intent: "signed.intent",
      status: "valid",
      type: "invitation",
    });
    const { interactor } = buildInteractor({ error: "emailAlreadyExists", pendingVerification: true });

    await expect(interactor.invoke({ ...signUpData, onboardingIntent: "signed.intent" })).resolves.toEqual({
      redirect: "/auth/verify-email?intent=signed.intent",
    });
  });

  it("tells an already verified account that it exists rather than bouncing it somewhere unexplained", async () => {
    const { interactor } = buildInteractor({ error: "emailAlreadyExists", pendingVerification: false });

    const result = await interactor.invoke(signUpData);

    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty("redirect");
  });

  it("keeps an invitation alive for an invitee who verified before signing up again", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      intent: "signed.intent",
      status: "valid",
      type: "invitation",
    });
    const { interactor } = buildInteractor({ error: "emailAlreadyExists", pendingVerification: false });

    await expect(interactor.invoke({ ...signUpData, onboardingIntent: "signed.intent" })).resolves.toEqual({
      redirect: "/auth/signin?intent=signed.intent",
    });
  });

  it("does not divert any other registration failure", async () => {
    const { interactor, isEmailPendingVerification } = buildInteractor({ error: "generic" });

    const result = await interactor.invoke(signUpData);

    expect(result).toMatchObject({ ok: false });
    expect(isEmailPendingVerification).not.toHaveBeenCalled();
  });
});

describe("SignUpWithEmailInteractor and the last page before signup", () => {
  function withRepo(args: { error?: string; failToRecord?: boolean }) {
    const recordSignupLastPageUnscoped = vi
      .fn()
      .mockImplementation(() => (args.failToRecord ? Promise.reject(new Error("down")) : Promise.resolve()));
    const recordSignupCampaignUnscoped = vi.fn().mockResolvedValue(undefined);
    const registerWithEmail = vi
      .fn()
      .mockResolvedValue(args.error ? { ok: false, error: args.error } : { ok: true, user: { id: "new-user" } });
    const interactor = new SignUpWithEmailInteractor(
      { registerWithEmail, isEmailPendingVerification: vi.fn().mockResolvedValue(false) } as unknown as AuthService,
      onboardingIntentService as never,
      { recordSignupLastPageUnscoped, recordSignupCampaignUnscoped },
    );
    return { interactor, recordSignupLastPageUnscoped, recordSignupCampaignUnscoped, registerWithEmail };
  }

  it("keeps the page on the new login so the company can take it at creation", async () => {
    const { interactor, recordSignupLastPageUnscoped, registerWithEmail } = withRepo({});

    await expect(interactor.invoke({ ...signUpData, signupLastPage: "/en/for/law-firms" })).resolves.toEqual({
      redirect: "/onboarding",
    });
    expect(recordSignupLastPageUnscoped).toHaveBeenCalledExactlyOnceWith("new-user", "/en/for/law-firms");
    expect(registerWithEmail.mock.calls[0]?.[0]).not.toHaveProperty("signupLastPage");
  });

  it("records nothing without a page and nothing when the registration failed", async () => {
    const withoutPage = withRepo({});
    await withoutPage.interactor.invoke(signUpData);
    expect(withoutPage.recordSignupLastPageUnscoped).not.toHaveBeenCalled();

    const failed = withRepo({ error: "generic" });
    await failed.interactor.invoke({ ...signUpData, signupLastPage: "/en/pricing" });
    expect(failed.recordSignupLastPageUnscoped).not.toHaveBeenCalled();
  });

  it("rejects a page that is not a plain same-site path before registering", async () => {
    const { interactor, registerWithEmail } = withRepo({});

    const result = await interactor.invoke({ ...signUpData, signupLastPage: "https://evil.example/?token=1" });

    expect(result).toMatchObject({ ok: false });
    expect(registerWithEmail).not.toHaveBeenCalled();
  });

  it("never fails the signup when the page cannot be stored", async () => {
    const { interactor } = withRepo({ failToRecord: true });

    await expect(interactor.invoke({ ...signUpData, signupLastPage: "/en/pricing" })).resolves.toEqual({
      redirect: "/onboarding",
    });
  });
});
