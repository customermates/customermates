import { describe, expect, it } from "vitest";

import {
  SIGNUP_LANDING_FALLBACK_PATH,
  decodeSignupJourneyCookie,
  encodeSignupJourneyCookie,
  nextSignupJourney,
  signupJourneyFromRequest,
  signupSourceForRegistration,
} from "../signup-source";

const BASE_URL = "https://customermates.com";
const NOW = new Date("2026-11-06T09:00:00.000Z");

describe("signup journey from the signup request", () => {
  it("keeps an allowed job, the page the visitor came from and the campaign parameters", () => {
    expect(
      signupJourneyFromRequest({
        searchParams: { job: "followup", utm_source: "linkedin", utm_medium: "paid social", utm_campaign: "q4-launch" },
        referer: "https://customermates.com/en/consultants?ref=hero#pricing",
        baseUrl: BASE_URL,
      }),
    ).toEqual({
      job: "followup",
      landingPath: "/en/consultants",
      referrerHost: null,
      utmSource: "linkedin",
      utmMedium: "paid social",
      utmCampaign: "q4-launch",
    });
  });

  it("records only the host of an external referrer and falls back to the signup page as landing path", () => {
    expect(
      signupJourneyFromRequest({
        searchParams: {},
        referer: "https://www.Google.com/search?q=customermates+crm",
        baseUrl: BASE_URL,
      }),
    ).toMatchObject({ job: null, landingPath: SIGNUP_LANDING_FALLBACK_PATH, referrerHost: "www.google.com" });
  });

  it.each([
    ["an unknown job", { job: "admin" }],
    ["a job list", { job: ["agent", "followup"] }],
  ])("accepts only the allowed jobs (%s)", (_, searchParams) => {
    const journey = signupJourneyFromRequest({ searchParams, referer: null, baseUrl: BASE_URL });
    expect(journey.job).toBe(Array.isArray(searchParams.job) ? "agent" : null);
  });

  it("drops campaign values with markup, control characters or excess length and non-web referrers", () => {
    expect(
      signupJourneyFromRequest({
        searchParams: { utm_source: "<script>", utm_medium: "a\u0000b", utm_campaign: "x".repeat(129) },
        referer: "javascript:alert(1)",
        baseUrl: BASE_URL,
      }),
    ).toEqual({
      job: null,
      landingPath: SIGNUP_LANDING_FALLBACK_PATH,
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
  });
});

describe("signup journey consent", () => {
  const input = {
    job: "agent" as const,
    landingPath: "/en/mcp",
    referrerHost: "news.ycombinator.com",
    utmSource: "hn",
    utmMedium: null,
    utmCampaign: null,
  };

  it("stores the referrer and campaign only with advertising consent", () => {
    expect(nextSignupJourney({ existing: null, input, marketingConsent: false, now: NOW })).toEqual({
      ...input,
      referrerHost: null,
      utmSource: null,
      capturedAt: NOW.toISOString(),
    });
    expect(nextSignupJourney({ existing: null, input, marketingConsent: true, now: NOW })).toEqual({
      ...input,
      capturedAt: NOW.toISOString(),
    });
  });

  it("keeps the first touch and takes a later job", () => {
    const first = nextSignupJourney({ existing: null, input, marketingConsent: true, now: NOW });
    const later = nextSignupJourney({
      existing: first,
      input: { ...input, job: "followup", landingPath: "/en/pricing", referrerHost: null, utmSource: null },
      marketingConsent: true,
      now: new Date("2026-11-06T10:00:00.000Z"),
    });

    expect(later).toEqual({ ...first, job: "followup" });
    expect(
      nextSignupJourney({ existing: later, input: { ...input, job: null }, marketingConsent: true, now: NOW }).job,
    ).toBe("followup");
  });

  it("strips marketing fields at registration when consent is missing or withdrawn", () => {
    const journey = { ...input, capturedAt: NOW.toISOString() };

    expect(signupSourceForRegistration(journey, null)).toEqual({
      job: "agent",
      landingPath: "/en/mcp",
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      marketingConsentedAt: null,
      capturedAt: NOW,
    });

    const consentedAt = new Date("2026-11-05T08:00:00.000Z");
    expect(signupSourceForRegistration(journey, consentedAt)).toMatchObject({
      referrerHost: "news.ycombinator.com",
      utmSource: "hn",
      marketingConsentedAt: consentedAt,
    });
  });

  it("records no consent time when no marketing field was stored", () => {
    const journey = { ...input, referrerHost: null, utmSource: null, capturedAt: NOW.toISOString() };
    expect(signupSourceForRegistration(journey, NOW).marketingConsentedAt).toBeNull();
  });
});

describe("signup journey cookie", () => {
  const journey = {
    job: "followup" as const,
    landingPath: "/de/berater",
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    capturedAt: NOW.toISOString(),
  };

  it("round-trips a valid journey", () => {
    const encoded = encodeSignupJourneyCookie(journey);
    expect(encoded).not.toBeNull();
    expect(decodeSignupJourneyCookie(encoded ?? undefined)).toEqual(journey);
  });

  it("ignores missing, malformed and out-of-set values", () => {
    const forged = Buffer.from(JSON.stringify({ ...journey, job: "owner" })).toString("base64url");

    expect(decodeSignupJourneyCookie(undefined)).toBeNull();
    expect(decodeSignupJourneyCookie("not-json")).toBeNull();
    expect(decodeSignupJourneyCookie(forged)).toBeNull();
    expect(decodeSignupJourneyCookie("x".repeat(4_096))).toBeNull();
  });
});
