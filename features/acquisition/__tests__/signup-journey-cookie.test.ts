import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const consent = { at: null as Date | null };
const notice = { version: null as string | null };

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", BASE_URL: "https://example.test" } }));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      delete: (name: string) => store.delete(name),
      get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
      has: (name: string) => store.has(name),
      set: (name: string, value: string) => store.set(name, value),
    }),
}));
vi.mock("../next/ad-attribution-cookie", () => ({ readAdvertisingConsentedAt: () => Promise.resolve(consent.at) }));
vi.mock("@/constants/legal-documents", () => ({
  get SIGNUP_SOURCE_NOTICE_VERSION() {
    return notice.version;
  },
}));

const { rememberSignupJourney } = await import("../next/signup-journey-cookie");
const { SIGNUP_JOURNEY_COOKIE_NAME } = await import("../signup-source");

const INPUT = {
  job: "followup",
  landingPath: "/en/features/follow-up",
  referrerHost: null,
  utmCampaign: null,
  utmMedium: null,
  utmSource: null,
};

describe("remembering the signup journey", () => {
  beforeEach(() => {
    store.clear();
    consent.at = null;
    notice.version = "2026-11-09";
  });

  it("stores nothing without marketing consent and removes an earlier cookie", async () => {
    store.set(SIGNUP_JOURNEY_COOKIE_NAME, "earlier");

    await rememberSignupJourney(INPUT);

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);
  });

  it("stores nothing while the privacy notice does not cover the signup source, even with consent", async () => {
    consent.at = new Date("2026-11-09T10:00:00.000Z");
    notice.version = null;

    await rememberSignupJourney(INPUT);

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);
  });

  it("stores the journey once the visitor has given marketing consent", async () => {
    consent.at = new Date("2026-11-09T10:00:00.000Z");

    await rememberSignupJourney(INPUT);

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(true);
  });
});
