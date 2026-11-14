import { describe, expect, it } from "vitest";

import {
  SIGNUP_LANDING_FALLBACK_PATH,
  choiceOnlyJourney,
  decodeSignupJourneyCookie,
  encodeSignupJourneyCookie,
  nextSignupJourney,
  signupJourneyFromRequest,
  signupSourceForRegistration,
  signupTemplateForRegistration,
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
      template: null,
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
      template: null,
      landingPath: SIGNUP_LANDING_FALLBACK_PATH,
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
  });
});

describe("signup journey template", () => {
  it("reads a known template slug from the signup request", () => {
    expect(
      signupJourneyFromRequest({ searchParams: { template: "client-tracker" }, referer: null, baseUrl: BASE_URL })
        .template,
    ).toBe("client-tracker");
    expect(
      signupJourneyFromRequest({ searchParams: { template: " Sales-Pipeline " }, referer: null, baseUrl: BASE_URL })
        .template,
    ).toBe("sales-pipeline");
  });

  it.each([
    ["an unknown slug", { template: "not-a-template" }],
    ["markup", { template: "<script>" }],
    ["an empty value", { template: "" }],
    ["a prototype key", { template: "constructor" }],
    ["no parameter", {}],
  ])("ignores %s", (_, searchParams) => {
    expect(signupJourneyFromRequest({ searchParams, referer: null, baseUrl: BASE_URL }).template).toBeNull();
  });

  it("takes the first value of a repeated parameter and rejects the rest", () => {
    expect(
      signupJourneyFromRequest({
        searchParams: { template: ["client-tracker", "sales-pipeline"] },
        referer: null,
        baseUrl: BASE_URL,
      }).template,
    ).toBe("client-tracker");
  });
});

describe("signup journey consent", () => {
  const input = {
    job: "agent" as const,
    template: "client-tracker" as const,
    landingPath: "/en/mcp",
    referrerHost: "news.ycombinator.com",
    utmSource: "hn",
    utmMedium: null,
    utmCampaign: null,
  };

  it("stores the page, goal, referrer and campaign only with advertising consent", () => {
    expect(nextSignupJourney({ existing: null, input, marketingConsent: false, now: NOW })).toEqual({
      job: null,
      template: "client-tracker",
      landingPath: SIGNUP_LANDING_FALLBACK_PATH,
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      capturedAt: NOW.toISOString(),
    });
    expect(nextSignupJourney({ existing: null, input, marketingConsent: true, now: NOW })).toEqual({
      ...input,
      capturedAt: NOW.toISOString(),
    });
  });

  it("keeps the template the visitor chose without any consent, nothing else", () => {
    expect(choiceOnlyJourney(input)).toEqual({
      job: null,
      template: "client-tracker",
      landingPath: SIGNUP_LANDING_FALLBACK_PATH,
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
  });

  it("keeps the first touch and takes a later job and template", () => {
    const first = nextSignupJourney({
      existing: null,
      input: { ...input, template: null },
      marketingConsent: true,
      now: NOW,
    });
    const later = nextSignupJourney({
      existing: first,
      input: {
        ...input,
        job: "followup",
        template: "sales-pipeline",
        landingPath: "/en/pricing",
        referrerHost: null,
        utmSource: null,
      },
      marketingConsent: true,
      now: new Date("2026-11-06T10:00:00.000Z"),
    });

    expect(later).toEqual({ ...first, job: "followup", template: "sales-pipeline" });
    expect(
      nextSignupJourney({
        existing: later,
        input: { ...input, job: null, template: null },
        marketingConsent: true,
        now: NOW,
      }),
    ).toMatchObject({ job: "followup", template: "sales-pipeline" });
  });

  it("stores no source at registration without consent, which is what the privacy notice promises", () => {
    const journey = { ...input, capturedAt: NOW.toISOString() };

    expect(signupSourceForRegistration(journey, null)).toBeNull();
    expect(signupTemplateForRegistration(journey)).toBe("client-tracker");

    const consentedAt = new Date("2026-11-05T08:00:00.000Z");
    expect(signupSourceForRegistration(journey, consentedAt)).toEqual({
      job: "agent",
      landingPath: "/en/mcp",
      referrerHost: "news.ycombinator.com",
      utmSource: "hn",
      utmMedium: null,
      utmCampaign: null,
      marketingConsentedAt: consentedAt,
      capturedAt: NOW,
    });
  });

  it("records no consent time when no marketing field was stored", () => {
    const journey = { ...input, referrerHost: null, utmSource: null, capturedAt: NOW.toISOString() };
    expect(signupSourceForRegistration(journey, NOW)?.marketingConsentedAt).toBeNull();
  });
});

describe("signup journey cookie", () => {
  const journey = {
    job: "followup" as const,
    template: null,
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

  it("round-trips a journey with a template", () => {
    const withTemplate = { ...journey, template: "real-estate-pipeline" as const };
    expect(decodeSignupJourneyCookie(encodeSignupJourneyCookie(withTemplate) ?? undefined)).toEqual(withTemplate);
  });

  it("reads a cookie written before templates existed", () => {
    const legacy = Object.fromEntries(Object.entries(journey).filter(([key]) => key !== "template"));
    const encoded = Buffer.from(JSON.stringify(legacy)).toString("base64url");

    expect(decodeSignupJourneyCookie(encoded)).toEqual(journey);
  });

  it("ignores missing, malformed and out-of-set values", () => {
    const forged = Buffer.from(JSON.stringify({ ...journey, job: "owner" })).toString("base64url");
    const forgedTemplate = Buffer.from(JSON.stringify({ ...journey, template: "../../etc" })).toString("base64url");

    expect(decodeSignupJourneyCookie(undefined)).toBeNull();
    expect(decodeSignupJourneyCookie("not-json")).toBeNull();
    expect(decodeSignupJourneyCookie(forged)).toBeNull();
    expect(decodeSignupJourneyCookie(forgedTemplate)).toBeNull();
    expect(decodeSignupJourneyCookie("x".repeat(4_096))).toBeNull();
  });
});
