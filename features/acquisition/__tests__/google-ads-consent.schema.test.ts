import { describe, expect, it } from "vitest";

import { buildPublicGoogleAdsCookieDecision, normalizeGoogleAdsClick } from "../google-ads-consent.schema";

describe("Google Ads click normalization", () => {
  it.each(["gclid", "gbraid", "wbraid"] as const)("preserves one case-sensitive %s", (kind) => {
    expect(
      normalizeGoogleAdsClick({ search: `?${kind}=Case-Sensitive_~.%2B` }, new Date("2026-08-31T10:00:00Z")),
    ).toEqual({
      kind,
      value: "Case-Sensitive_~.+",
      capturedAt: "2026-08-31T10:00:00.000Z",
    });
  });

  it.each([
    "?utm_source=google&utm_medium=cpc",
    "?gclid=",
    "?gclid=one&gclid=two",
    "?gclid=one&wbraid=two",
    "?gclid=one&gclid=two&wbraid=three",
    "?gclid=contains%20space",
    "?gclid=contains%C2%A0space",
    "?gclid=contains%E2%80%AEformat",
  ])("rejects ambiguous or absent click identifiers in %s", (search) => {
    expect(normalizeGoogleAdsClick({ search })).toBeNull();
  });

  it("stores only the click after consent and removes it after refusal", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicGoogleAdsCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: { search: "?gclid=one&utm_campaign=ignored" },
      },
      now,
    });
    expect(allowed.click).toEqual({
      kind: "gclid",
      value: "one",
      capturedAt: now.toISOString(),
    });
    expect(JSON.stringify(allowed)).not.toContain("utm_campaign");

    const refused = buildPublicGoogleAdsCookieDecision({
      existing: allowed,
      input: { choice: "necessary-only", visit: { search: "?gclid=two" } },
      now: new Date("2026-08-31T10:01:00.000Z"),
    });
    expect(refused.consent.advertising).toBe(false);
    expect(refused.click).toBeNull();
  });
});
