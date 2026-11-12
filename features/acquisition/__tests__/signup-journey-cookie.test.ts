import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const consent = { at: null as Date | null };
const notice = { version: null as string | null };
const environment = { APP_MODE: "cloud" };

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: {
    get APP_MODE() {
      return environment.APP_MODE;
    },
    BASE_URL: "https://example.test",
  },
}));
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

const { forgetSignupJourney, readRegistrationSignupSource, readRegistrationSignupTemplate, rememberSignupJourney } =
  await import("../next/signup-journey-cookie");
const { SIGNUP_JOURNEY_COOKIE_NAME, decodeSignupJourneyCookie } = await import("../signup-source");

const INPUT = {
  job: "followup",
  template: null,
  landingPath: "/en/features/follow-up",
  referrerHost: "www.google.com",
  utmCampaign: null,
  utmMedium: null,
  utmSource: null,
};

const WITH_TEMPLATE = { ...INPUT, template: "client-tracker" };

function storedJourney() {
  return decodeSignupJourneyCookie(store.get(SIGNUP_JOURNEY_COOKIE_NAME));
}

describe("remembering the signup journey", () => {
  beforeEach(() => {
    store.clear();
    consent.at = null;
    notice.version = "2026-11-09";
    environment.APP_MODE = "cloud";
  });

  it("stores nothing without marketing consent and removes an earlier cookie when no template was chosen", async () => {
    store.set(SIGNUP_JOURNEY_COOKIE_NAME, "earlier");

    await rememberSignupJourney(INPUT);

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);
  });

  it("keeps only the chosen template without marketing consent: no page, goal, referrer or campaign", async () => {
    await rememberSignupJourney(WITH_TEMPLATE);

    expect(storedJourney()).toMatchObject({
      job: null,
      template: "client-tracker",
      landingPath: "/auth/signup",
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
  });

  it("keeps the template across a later submit that no longer carries it", async () => {
    await rememberSignupJourney(WITH_TEMPLATE);
    await rememberSignupJourney(INPUT);

    expect(storedJourney()?.template).toBe("client-tracker");
  });

  it("reduces a consented cookie to the template when the consent is gone", async () => {
    consent.at = new Date("2026-11-09T10:00:00.000Z");
    await rememberSignupJourney(WITH_TEMPLATE);
    consent.at = null;

    await rememberSignupJourney(INPUT);

    expect(storedJourney()).toMatchObject({ job: null, template: "client-tracker", referrerHost: null });
  });

  it("keeps only the template while the privacy notice does not cover the signup source, even with consent", async () => {
    consent.at = new Date("2026-11-09T10:00:00.000Z");
    notice.version = null;

    await rememberSignupJourney(INPUT);
    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);

    await rememberSignupJourney(WITH_TEMPLATE);
    expect(storedJourney()).toMatchObject({ job: null, template: "client-tracker", referrerHost: null });
  });

  it("stores the whole journey once the visitor has given marketing consent", async () => {
    consent.at = new Date("2026-11-09T10:00:00.000Z");

    await rememberSignupJourney(WITH_TEMPLATE);

    expect(storedJourney()).toMatchObject({
      job: "followup",
      template: "client-tracker",
      landingPath: "/en/features/follow-up",
      referrerHost: "www.google.com",
    });
  });

  it("refuses a template that is not in the library and a malformed journey", async () => {
    await rememberSignupJourney({ ...INPUT, template: "../../etc/passwd" });
    await rememberSignupJourney("garbage");

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);
  });

  it("stores nothing on a self-hosted instance", async () => {
    environment.APP_MODE = "self-hosted";

    await rememberSignupJourney(WITH_TEMPLATE);

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);
  });
});

describe("reading the signup journey at registration", () => {
  beforeEach(() => {
    store.clear();
    consent.at = null;
    notice.version = "2026-11-09";
    environment.APP_MODE = "cloud";
  });

  it("hands over the template and no source for a visitor who did not allow the signup source", async () => {
    await rememberSignupJourney(WITH_TEMPLATE);

    await expect(readRegistrationSignupTemplate()).resolves.toBe("client-tracker");
    await expect(readRegistrationSignupSource()).resolves.toBeNull();
  });

  it("hands over the source and the template for a visitor who allowed it", async () => {
    consent.at = new Date("2026-11-09T10:00:00.000Z");
    await rememberSignupJourney(WITH_TEMPLATE);

    await expect(readRegistrationSignupTemplate()).resolves.toBe("client-tracker");
    await expect(readRegistrationSignupSource()).resolves.toMatchObject({
      job: "followup",
      landingPath: "/en/features/follow-up",
      referrerHost: "www.google.com",
      marketingConsentedAt: consent.at,
    });
  });

  it("hands over nothing without a cookie or on a self-hosted instance", async () => {
    await expect(readRegistrationSignupTemplate()).resolves.toBeNull();
    await expect(readRegistrationSignupSource()).resolves.toBeNull();

    await rememberSignupJourney(WITH_TEMPLATE);
    environment.APP_MODE = "self-hosted";
    await expect(readRegistrationSignupTemplate()).resolves.toBeNull();
    await expect(readRegistrationSignupSource()).resolves.toBeNull();
  });

  it("forgets the journey after registration", async () => {
    await rememberSignupJourney(WITH_TEMPLATE);

    await forgetSignupJourney();

    expect(store.has(SIGNUP_JOURNEY_COOKIE_NAME)).toBe(false);
  });
});
