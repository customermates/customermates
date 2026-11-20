import { describe, expect, it } from "vitest";

import {
  EncodedSignupCampaignSchema,
  decodeSignupCampaign,
  encodeSignupCampaign,
  readSignupCampaign,
  signupCampaignFromRequest,
} from "../signup-campaign";
import { signupCampaignFromSignupRequest, signupRequestFromRequest } from "../signup-source";

const BASE_URL = "https://customermates.com";

describe("signup campaign", () => {
  it("reads all five utm parameters from the signup link", () => {
    expect(
      signupCampaignFromRequest({
        searchParams: {
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "en-connect",
          utm_content: "g1",
          utm_term: "claude linkedin connector",
        },
        referer: null,
        baseUrl: BASE_URL,
      }),
    ).toEqual({
      source: "google",
      medium: "cpc",
      campaign: "en-connect",
      content: "g1",
      term: "claude linkedin connector",
    });
  });

  it("falls back to the utm parameters of the same-site page the visitor came from", () => {
    expect(
      signupCampaignFromRequest({
        searchParams: {},
        referer: `${BASE_URL}/de/features/claude-linkedin?utm_source=google&utm_medium=cpc&utm_campaign=dach-connect`,
        baseUrl: BASE_URL,
      }),
    ).toEqual({ source: "google", medium: "cpc", campaign: "dach-connect", content: null, term: null });
  });

  it("prefers the signup link over the page before it", () => {
    expect(
      signupCampaignFromRequest({
        searchParams: { utm_campaign: "from-link" },
        referer: `${BASE_URL}/pricing?utm_campaign=from-page`,
        baseUrl: BASE_URL,
      })?.campaign,
    ).toBe("from-link");
  });

  it("ignores the utm parameters of another site and links without any", () => {
    expect(
      signupCampaignFromRequest({
        searchParams: {},
        referer: "https://example.com/?utm_source=elsewhere",
        baseUrl: BASE_URL,
      }),
    ).toBeNull();
    expect(signupCampaignFromRequest({ searchParams: {}, referer: null, baseUrl: BASE_URL })).toBeNull();
    expect(signupCampaignFromRequest({ searchParams: {}, referer: "not a url", baseUrl: BASE_URL })).toBeNull();
  });

  it("drops values that are not plain campaign text", () => {
    expect(
      signupCampaignFromRequest({
        searchParams: { utm_source: "<script>alert(1)</script>", utm_medium: "cpc", utm_term: "a".repeat(129) },
        referer: null,
        baseUrl: BASE_URL,
      }),
    ).toEqual({ source: null, medium: "cpc", campaign: null, content: null, term: null });
  });

  it("round-trips through the text stored on the pending login", () => {
    const campaign = { source: "google", medium: "cpc", campaign: "k1", content: null, term: "crm für outlook" };
    const encoded = encodeSignupCampaign(campaign);

    expect(encoded).not.toBeNull();
    expect(EncodedSignupCampaignSchema.safeParse(encoded).success).toBe(true);
    expect(decodeSignupCampaign(encoded)).toEqual(campaign);
  });

  it("refuses stored text that is not a campaign", () => {
    expect(decodeSignupCampaign(null)).toBeNull();
    expect(decodeSignupCampaign("{")).toBeNull();
    expect(decodeSignupCampaign('{"source":null,"medium":null,"campaign":null,"content":null,"term":null}')).toBeNull();
    expect(decodeSignupCampaign('{"source":"google","extra":"x"}')).toBeNull();
    expect(EncodedSignupCampaignSchema.safeParse("x".repeat(2_000)).success).toBe(false);
    expect(encodeSignupCampaign(null)).toBeNull();
    expect(readSignupCampaign({ source: "google" })).toBeNull();
  });

  it("travels with the signup request next to the last page", () => {
    const request = signupRequestFromRequest({
      searchParams: {},
      referer: `${BASE_URL}/features/claude-crm?utm_source=google&utm_campaign=en-connect`,
      baseUrl: BASE_URL,
    });

    expect(request.lastPage).toBe("/features/claude-crm");
    expect(decodeSignupCampaign(signupCampaignFromSignupRequest(request))).toEqual({
      source: "google",
      medium: null,
      campaign: "en-connect",
      content: null,
      term: null,
    });
    expect(signupCampaignFromSignupRequest({ campaign: { source: "<bad>" } })).toBeNull();
    expect(signupCampaignFromSignupRequest(undefined)).toBeNull();
  });
});
