import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearInviteCookie: vi.fn(),
  clearRegisteredClick: vi.fn(),
  complete: vi.fn(),
  getSession: vi.fn(),
  readAttribution: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  refresh: vi.fn(),
  register: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/core/di", () => ({
  getAuthService: () => ({ getSession: mocks.getSession }),
  getCompleteOnboardingWizardInteractor: () => ({ invoke: mocks.complete }),
  getRegisterUserInteractor: () => ({ invoke: mocks.register }),
}));
vi.mock("@/core/utils/action-result", () => ({
  serializeResult: async (result: unknown) => await result,
}));
vi.mock("@/features/acquisition/next/ad-attribution-cookie", () => ({
  clearRegisteredAdClicksFromCookie: mocks.clearRegisteredClick,
  readRegistrationAdAttribution: mocks.readAttribution,
}));
vi.mock("@/features/company/next/invite-token-cookie", () => ({
  clearInviteTokenCookie: mocks.clearInviteCookie,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));

import { registerProfileAction } from "../actions";

const registration = {
  agreeToTerms: true,
  avatarUrl: null,
  country: "de" as const,
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "Example",
};

const attribution = [
  {
    capturedAt: new Date("2026-08-31T10:00:00.000Z"),
    clickedAt: new Date("2026-08-31T09:55:00.000Z"),
    consentedAt: new Date("2026-08-31T09:59:00.000Z"),
    consentNoticeVersion: "2026-09-02",
    expiresAt: new Date("2026-11-28T10:00:00.000Z"),
    identifierKind: "gclid" as const,
    identifierValue: "Case-Sensitive_GCLID",
    provider: "google_ads" as const,
  },
];

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

describe("onboarding registration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearRegisteredClick.mockResolvedValue(undefined);
    mocks.clearInviteCookie.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({ user: { id: "user-one" } });
    mocks.readAttribution.mockResolvedValue(attribution);
    mocks.resolveOnboardingIntent.mockResolvedValue(invitation);
    mocks.register.mockResolvedValue({
      data: { redirectTo: "/auth/pending" },
      ok: true,
    });
  });

  it("uses the explicit invitation even when ambient state could point elsewhere", async () => {
    await expect(registerProfileAction(registration, "signed-invitation-a")).rejects.toThrow("REDIRECT:/auth/pending");

    expect(mocks.resolveOnboardingIntent).toHaveBeenCalledWith("signed-invitation-a");
    expect(mocks.register).toHaveBeenCalledWith(registration, {
      adAttribution: attribution,
      target: { companyId: "company-invited", type: "invitation" },
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("uses a create decision only for the identity that made it", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      authUserId: "user-one",
      intent: "signed-create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });

    await expect(registerProfileAction(registration, "signed-create")).rejects.toThrow("REDIRECT:/auth/pending");

    expect(mocks.register).toHaveBeenCalledWith(registration, {
      adAttribution: attribution,
      target: { type: "createCompany" },
    });
  });

  it("rejects a create decision made by a different identity before registration", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      authUserId: "user-two",
      intent: "signed-create",
      source: "explicit",
      status: "valid",
      type: "createCompany",
    });

    await expect(registerProfileAction(registration, "signed-create")).rejects.toThrow(
      "REDIRECT:/en/auth/error?type=invalidOnboardingIntent",
    );

    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.clearInviteCookie).toHaveBeenCalledOnce();
  });

  it.each(["invalidOnboardingIntent", "onboardingSessionExpired"] as const)(
    "fails closed for an explicit %s intent",
    async (errorMessage) => {
      mocks.resolveOnboardingIntent.mockResolvedValue({
        errorMessage,
        source: "explicit",
        status: "invalid",
      });

      await expect(registerProfileAction(registration, "bad-intent")).rejects.toThrow(
        `REDIRECT:/en/auth/error?type=${errorMessage}`,
      );

      expect(mocks.register).not.toHaveBeenCalled();
      expect(mocks.clearInviteCookie).toHaveBeenCalledOnce();
    },
  );

  it("retains the legacy identity binding only when no explicit intent exists", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });

    await expect(registerProfileAction(registration)).rejects.toThrow("REDIRECT:/auth/pending");

    expect(mocks.register).toHaveBeenCalledWith(registration, {
      adAttribution: attribution,
      target: { type: "legacyAuthBinding" },
    });
  });

  it("clears an invalid rollout cookie and continues with a live identity binding", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      errorMessage: "inviteLinkExpired",
      source: "legacy",
      status: "invalid",
    });

    await expect(registerProfileAction(registration)).rejects.toThrow("REDIRECT:/auth/pending");

    expect(mocks.clearInviteCookie).toHaveBeenCalled();
    expect(mocks.register).toHaveBeenCalledWith(registration, {
      adAttribution: attribution,
      target: { type: "legacyAuthBinding" },
    });
  });

  it("clears attribution and the legacy invite only after registration succeeds", async () => {
    await expect(registerProfileAction(registration, "signed-invitation-a")).rejects.toThrow("REDIRECT:/auth/pending");

    expect(mocks.readAttribution.mock.invocationCallOrder[0]).toBeLessThan(mocks.register.mock.invocationCallOrder[0]);
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearRegisteredClick.mock.invocationCallOrder[0],
    );
    expect(mocks.clearRegisteredClick).toHaveBeenCalledOnce();
    expect(mocks.clearInviteCookie).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps recoverable state when registration fails", async () => {
    mocks.register.mockResolvedValue({
      error: { fieldErrors: {}, formErrors: [] },
      ok: false,
    });

    await expect(registerProfileAction(registration, "signed-invitation-a")).resolves.toEqual({
      error: { fieldErrors: {}, formErrors: [] },
      ok: false,
    });

    expect(mocks.clearRegisteredClick).not.toHaveBeenCalled();
    expect(mocks.clearInviteCookie).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
