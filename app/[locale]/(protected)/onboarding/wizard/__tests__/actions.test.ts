import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearRegisteredClick: vi.fn(),
  complete: vi.fn(),
  readAttribution: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  refresh: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/core/di", () => ({
  getCompleteOnboardingWizardInteractor: () => ({ invoke: mocks.complete }),
  getRegisterOnboardingProfileInteractor: () => ({ invoke: mocks.register }),
}));
vi.mock("@/core/utils/action-result", () => ({ serializeResult: async (result: unknown) => await result }));
vi.mock("@/features/acquisition/next/ad-attribution-cookie", () => ({
  clearRegisteredAdClicksFromCookie: mocks.clearRegisteredClick,
  readRegistrationAdAttribution: mocks.readAttribution,
}));

import { registerProfileAction } from "../actions";

const registration = {
  agreeToTerms: true,
  avatarUrl: null,
  country: "de" as const,
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "Example",
  onboardingIntent: "signed-invitation-a",
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

describe("onboarding registration action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearRegisteredClick.mockResolvedValue(undefined);
    mocks.readAttribution.mockResolvedValue(attribution);
  });

  it("passes form and request attribution to the onboarding interactor", async () => {
    mocks.register.mockResolvedValue({ ok: false, error: { fieldErrors: {}, formErrors: [] } });

    await expect(registerProfileAction(registration)).resolves.toEqual({
      ok: false,
      error: { fieldErrors: {}, formErrors: [] },
    });

    expect(mocks.register).toHaveBeenCalledExactlyOnceWith(registration, { adAttribution: attribution });
    expect(mocks.clearRegisteredClick).not.toHaveBeenCalled();
  });

  it("localizes redirects returned by the onboarding interactor", async () => {
    mocks.register.mockResolvedValue({ redirect: "/auth/signin?intent=signed-invitation-a" });

    await expect(registerProfileAction(registration)).rejects.toThrow(
      "REDIRECT:/en/auth/signin?intent=signed-invitation-a",
    );
    expect(mocks.clearRegisteredClick).not.toHaveBeenCalled();
  });

  it("clears consumed ad attribution and refreshes only after registration succeeds", async () => {
    mocks.register.mockResolvedValue({ data: { redirectTo: "/auth/pending" }, ok: true });

    await expect(registerProfileAction(registration)).rejects.toThrow("REDIRECT:/auth/pending");

    expect(mocks.clearRegisteredClick).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
