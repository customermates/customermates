import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyPlaybook: vi.fn(),
  clearRegisteredClick: vi.fn(),
  complete: vi.fn(),
  readAttribution: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  refresh: vi.fn(),
  register: vi.fn(),
  readSignupSource: vi.fn(),
  forgetSignupJourney: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/core/di", () => ({
  getApplyOnboardingPlaybookInteractor: () => ({ invoke: mocks.applyPlaybook }),
  getCompleteOnboardingWizardInteractor: () => ({ invoke: mocks.complete }),
  getRegisterOnboardingProfileInteractor: () => ({ invoke: mocks.register }),
}));
vi.mock("@/core/utils/action-result", () => ({
  serializeResult: async (result: unknown) => await result,
  serializeTypedResult: async (result: unknown) => await result,
  settleActionResult: async (result: unknown) => await result,
}));
vi.mock("@/features/acquisition/next/ad-attribution-cookie", () => ({
  clearRegisteredAdClicksFromCookie: mocks.clearRegisteredClick,
  readRegistrationAdAttribution: mocks.readAttribution,
}));

vi.mock("@/features/acquisition/next/signup-journey-cookie", () => ({
  forgetSignupJourney: mocks.forgetSignupJourney,
  readRegistrationSignupSource: mocks.readSignupSource,
}));

import { applyOnboardingPlaybookAction, completeOnboardingWizardAction, registerProfileAction } from "../actions";

const registration = {
  agreeToTerms: true,
  avatarUrl: null,
  displayLanguage: "system" as const,
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
    consentNoticeVersion: "2026-11-09",
    expiresAt: new Date("2026-11-28T10:00:00.000Z"),
    identifierKind: "gclid" as const,
    identifierValue: "Case-Sensitive_GCLID",
    provider: "google_ads" as const,
  },
];

const signupSource = {
  job: "followup" as const,
  landingPath: "/en/consultants",
  referrerHost: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  marketingConsentedAt: null,
  capturedAt: new Date("2026-11-06T08:00:00.000Z"),
};

describe("onboarding registration action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearRegisteredClick.mockResolvedValue(undefined);
    mocks.readAttribution.mockResolvedValue(attribution);
    mocks.readSignupSource.mockResolvedValue(signupSource);
    mocks.forgetSignupJourney.mockResolvedValue(undefined);
  });

  it("passes form and request attribution to the onboarding interactor", async () => {
    mocks.register.mockResolvedValue({ ok: false, error: { fieldErrors: {}, formErrors: [] } });

    await expect(registerProfileAction(registration)).resolves.toEqual({
      ok: false,
      error: { fieldErrors: {}, formErrors: [] },
    });

    expect(mocks.register).toHaveBeenCalledExactlyOnceWith(registration, { adAttribution: attribution, signupSource });
    expect(mocks.clearRegisteredClick).not.toHaveBeenCalled();
    expect(mocks.forgetSignupJourney).not.toHaveBeenCalled();
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

    await expect(registerProfileAction(registration)).rejects.toThrow("REDIRECT:/en/auth/pending");

    expect(mocks.clearRegisteredClick).toHaveBeenCalledOnce();
    expect(mocks.forgetSignupJourney).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("continues in the display language chosen on the profile step", async () => {
    mocks.register.mockResolvedValue({ data: { redirectTo: "/onboarding/wizard" }, ok: true });

    await expect(registerProfileAction({ ...registration, displayLanguage: "de" })).rejects.toThrow(
      "REDIRECT:/de/onboarding/wizard",
    );
    await expect(registerProfileAction({ ...registration, displayLanguage: "en" })).rejects.toThrow(
      "REDIRECT:/en/onboarding/wizard",
    );
  });
});

describe("onboarding wizard completion action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a member whose account state moved on to that state's page in their language", async () => {
    mocks.complete.mockResolvedValue({ redirect: "/auth/pending" });

    await expect(completeOnboardingWizardAction()).rejects.toThrow("REDIRECT:/en/auth/pending");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("onboarding playbook action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the playbook in the current language and refreshes once onboarding is finished", async () => {
    const data = { playbook: "consultants", pagesWritten: 4, redirectTo: "/w/atlas/settings/channels?from=onboarding" };
    mocks.applyPlaybook.mockResolvedValue({ ok: true, data });

    await expect(applyOnboardingPlaybookAction({ playbook: "consultants" })).resolves.toEqual({ ok: true, data });
    expect(mocks.applyPlaybook).toHaveBeenCalledExactlyOnceWith({ playbook: "consultants", locale: "en" });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the page as it is when the playbook could not be written", async () => {
    mocks.applyPlaybook.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });

    await expect(applyOnboardingPlaybookAction({ playbook: null })).resolves.toMatchObject({ ok: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
