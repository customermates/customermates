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
