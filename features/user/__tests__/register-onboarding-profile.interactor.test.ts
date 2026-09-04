import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterOnboardingProfileInteractor } from "../register/register-onboarding-profile.interactor";

const registration = {
  agreeToTerms: true,
  avatarUrl: null,
  country: "de" as const,
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "Example",
};

const invitation = {
  companyId: "company-invited",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  intent: "signed-invitation-a",
  inviterName: "Invite Admin",
  source: "explicit",
  status: "valid",
  token: "invite-a",
  type: "invitation",
} as const;

describe("RegisterOnboardingProfileInteractor", () => {
  const authService = { getSession: vi.fn() };
  const onboardingIntentService = { resolve: vi.fn() };
  const inviteTokenCookieRepo = { clear: vi.fn(), read: vi.fn() };
  const registerUserInteractor = { invoke: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    authService.getSession.mockResolvedValue({ user: { id: "user-one" } });
    onboardingIntentService.resolve.mockResolvedValue(invitation);
    inviteTokenCookieRepo.clear.mockResolvedValue(undefined);
    inviteTokenCookieRepo.read.mockResolvedValue(undefined);
    registerUserInteractor.invoke.mockResolvedValue({ data: { redirectTo: "/auth/pending" }, ok: true });
  });

  function createInteractor() {
    return new RegisterOnboardingProfileInteractor(
      authService as never,
      onboardingIntentService as never,
      inviteTokenCookieRepo as never,
      registerUserInteractor as never,
    );
  }

  it("gives an explicit invitation precedence over ambient state", async () => {
    await expect(createInteractor().invoke({ ...registration, onboardingIntent: invitation.intent })).resolves.toEqual({
      data: { redirectTo: "/auth/pending" },
      ok: true,
    });

    expect(inviteTokenCookieRepo.read).not.toHaveBeenCalled();
    expect(registerUserInteractor.invoke).toHaveBeenCalledWith(registration, {
      adAttribution: undefined,
      target: { companyId: "company-invited", type: "invitation" },
    });
    expect(inviteTokenCookieRepo.clear).toHaveBeenCalledOnce();
  });

  it("uses a create decision only for the identity that made it", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      authUserId: "user-one",
      intent: "signed-create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });

    await createInteractor().invoke({ ...registration, onboardingIntent: "signed-create" });

    expect(registerUserInteractor.invoke).toHaveBeenCalledWith(registration, {
      adAttribution: undefined,
      target: { type: "createCompany" },
    });
  });

  it("rejects a create decision made by another identity", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      authUserId: "user-two",
      intent: "signed-create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });

    await expect(createInteractor().invoke({ ...registration, onboardingIntent: "signed-create" })).resolves.toEqual({
      redirect: "/auth/error?type=invalidOnboardingIntent",
    });
    expect(registerUserInteractor.invoke).not.toHaveBeenCalled();
    expect(inviteTokenCookieRepo.clear).toHaveBeenCalledOnce();
  });

  it.each(["invalidOnboardingIntent", "onboardingSessionExpired"] as const)(
    "fails closed for an explicit %s intent",
    async (errorMessage) => {
      onboardingIntentService.resolve.mockResolvedValue({ errorMessage, source: "explicit", status: "invalid" });

      await expect(createInteractor().invoke({ ...registration, onboardingIntent: "bad-intent" })).resolves.toEqual({
        redirect: `/auth/error?type=${errorMessage}`,
      });
      expect(registerUserInteractor.invoke).not.toHaveBeenCalled();
      expect(inviteTokenCookieRepo.clear).toHaveBeenCalledOnce();
    },
  );

  it("resumes a preexisting invitation binding only without explicit intent", async () => {
    onboardingIntentService.resolve.mockResolvedValue({ status: "absent" });
    inviteTokenCookieRepo.read.mockResolvedValue(undefined);

    await createInteractor().invoke(registration);

    expect(onboardingIntentService.resolve).toHaveBeenCalledWith(undefined, undefined);
    expect(registerUserInteractor.invoke).toHaveBeenCalledWith(registration, {
      adAttribution: undefined,
      target: { type: "existingAuthUserCompanyBinding" },
    });
  });

  it("clears an invalid rollout cookie and continues with a live identity binding", async () => {
    inviteTokenCookieRepo.read.mockResolvedValue("rollout-invite");
    onboardingIntentService.resolve.mockResolvedValue({
      errorMessage: "inviteLinkExpired",
      source: "legacy",
      status: "invalid",
    });

    await createInteractor().invoke(registration);

    expect(inviteTokenCookieRepo.clear).toHaveBeenCalledTimes(2);
    expect(registerUserInteractor.invoke).toHaveBeenCalledWith(registration, {
      adAttribution: undefined,
      target: { type: "existingAuthUserCompanyBinding" },
    });
  });

  it("preserves the intent across authentication redirects and recoverable validation", async () => {
    registerUserInteractor.invoke.mockResolvedValueOnce({ redirect: "/auth/signin" });
    await expect(createInteractor().invoke({ ...registration, onboardingIntent: invitation.intent })).resolves.toEqual({
      redirect: `/auth/signin?intent=${invitation.intent}`,
    });
    expect(inviteTokenCookieRepo.clear).not.toHaveBeenCalled();

    registerUserInteractor.invoke.mockResolvedValueOnce({ ok: false, error: new Error("validation") });
    const result = await createInteractor().invoke({ ...registration, onboardingIntent: invitation.intent });
    expect(result).toMatchObject({ ok: false });
    expect(inviteTokenCookieRepo.clear).not.toHaveBeenCalled();
  });

  it("preserves an invitation when registration needs the account signup screen", async () => {
    registerUserInteractor.invoke.mockResolvedValue({ redirect: "/auth/signup" });

    await expect(createInteractor().invoke({ ...registration, onboardingIntent: invitation.intent })).resolves.toEqual({
      redirect: `/auth/signup?intent=${invitation.intent}`,
    });
    expect(inviteTokenCookieRepo.clear).not.toHaveBeenCalled();
  });

  it("preserves a create decision when its session needs to be restored", async () => {
    onboardingIntentService.resolve.mockResolvedValue({
      authUserId: "user-one",
      intent: "signed-create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });
    authService.getSession.mockResolvedValue(null);

    await expect(createInteractor().invoke({ ...registration, onboardingIntent: "signed-create" })).resolves.toEqual({
      redirect: "/auth/signin?intent=signed-create",
    });
    expect(registerUserInteractor.invoke).not.toHaveBeenCalled();
    expect(inviteTokenCookieRepo.clear).not.toHaveBeenCalled();
  });
});
