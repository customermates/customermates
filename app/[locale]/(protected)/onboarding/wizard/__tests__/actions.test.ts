import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearRegisteredClick: vi.fn(),
  complete: vi.fn(),
  deleteCookie: vi.fn(),
  readAttribution: vi.fn(),
  redirect: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ delete: mocks.deleteCookie }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/core/di", () => ({
  getCompleteOnboardingWizardInteractor: () => ({ invoke: mocks.complete }),
  getRegisterUserInteractor: () => ({ invoke: mocks.register }),
}));
vi.mock("@/core/utils/action-result", () => ({
  serializeResult: async (result: unknown) => await result,
}));
vi.mock("@/features/acquisition/google-ads-consent.cookie", () => ({
  clearRegisteredGoogleAdsClickFromCookie: mocks.clearRegisteredClick,
  readRegistrationGoogleAdsAttribution: mocks.readAttribution,
}));

import { registerProfileAction } from "../actions";

const registration = {
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "Example",
  country: "de" as const,
  avatarUrl: null,
  agreeToTerms: true,
};

const attribution = {
  clickId: "Case-Sensitive_GCLID",
  clickIdKind: "gclid" as const,
  capturedAt: new Date("2026-08-31T10:00:00.000Z"),
  consentedAt: new Date("2026-08-31T09:59:00.000Z"),
  expiresAt: new Date("2026-11-28T10:00:00.000Z"),
};

describe("onboarding registration Google Ads attribution boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearRegisteredClick.mockResolvedValue(undefined);
    mocks.readAttribution.mockResolvedValue(attribution);
    mocks.register.mockResolvedValue({
      ok: true,
      data: { redirectTo: "/onboarding/wizard" },
    });
  });

  it("reads the signed click before registration and clears it only after success", async () => {
    await registerProfileAction(registration);

    expect(mocks.register).toHaveBeenCalledWith(registration, {
      googleAdsAttribution: attribution,
    });
    expect(mocks.readAttribution.mock.invocationCallOrder[0]).toBeLessThan(mocks.register.mock.invocationCallOrder[0]);
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearRegisteredClick.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteCookie).toHaveBeenCalledWith("inviteToken");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding/wizard");
  });

  it("keeps the signed click available when registration fails", async () => {
    mocks.register.mockResolvedValue({
      ok: false,
      error: { formErrors: [], fieldErrors: {} },
    });

    await registerProfileAction(registration);

    expect(mocks.clearRegisteredClick).not.toHaveBeenCalled();
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
