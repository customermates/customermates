import { describe, expect, it } from "vitest";

import {
  buildPublicGoogleAdsCookieDecision,
  hasPendingGoogleAdsClick,
  normalizeGoogleAdsClick,
  preserveGoogleAdsClickInHref,
  RegistrationGoogleAdsAttributionSchema,
  removeGoogleAdsClickFromHref,
} from "../google-ads-consent.schema";

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

  it("keeps one undecided click in same-origin navigation URLs without carrying campaign fields", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(
      preserveGoogleAdsClickInHref(
        "/en/privacy?section=advertising#choices",
        {
          search: "?utm_campaign=cloud-crm&gclid=Case-Sensitive_~.%2B",
          pendingAt: now.toISOString(),
        },
        now,
      ),
    ).toBe("/en/privacy?section=advertising&gclid=Case-Sensitive_%7E.%2B&cm_ads_pending=1788170400#choices");
    expect(
      preserveGoogleAdsClickInHref("https://example.com/privacy", {
        search: "?gclid=paid-click",
      }),
    ).toBe("https://example.com/privacy");
  });

  it("recognizes only one marked pending click", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(hasPendingGoogleAdsClick({ search: "?gclid=one&cm_ads_pending=1788170400" }, now)).toBe(true);
    expect(hasPendingGoogleAdsClick({ search: "?gclid=one" }, now)).toBe(false);
    expect(
      hasPendingGoogleAdsClick(
        {
          search: "?gclid=one&cm_ads_pending=1788170400&cm_ads_pending=1788170400",
        },
        now,
      ),
    ).toBe(false);
    expect(hasPendingGoogleAdsClick({ search: "?cm_ads_pending=1788170400" }, now)).toBe(false);
    expect(hasPendingGoogleAdsClick({ search: "?gclid=one&cm_ads_pending=1788084000" }, now)).toBe(true);
    expect(hasPendingGoogleAdsClick({ search: "?gclid=one&cm_ads_pending=1788083999" }, now)).toBe(false);
    expect(hasPendingGoogleAdsClick({ search: "?gclid=one&cm_ads_pending=1788170700" }, now)).toBe(true);
    expect(hasPendingGoogleAdsClick({ search: "?gclid=one&cm_ads_pending=1788170701" }, now)).toBe(false);
  });

  it("does not refresh an explicitly expired pending visit", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(
      preserveGoogleAdsClickInHref(
        "/en/privacy",
        { pendingAt: "2026-08-30T09:59:59.000Z", search: "?gclid=stale-click" },
        now,
      ),
    ).toBe("/en/privacy");
  });

  it("removes every click identifier after the visitor decides", () => {
    expect(
      removeGoogleAdsClickFromHref(
        "/de/privacy?section=advertising&gclid=one&gbraid=two&wbraid=three&cm_ads_pending=1788170400#choices",
      ),
    ).toBe("/de/privacy?section=advertising#choices");
  });

  it("stores only the click after consent and removes it after refusal", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicGoogleAdsCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: {
          pendingAt: now.toISOString(),
          search: "?gclid=one&utm_campaign=ignored",
        },
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
      input: {
        choice: "necessary-only",
        visit: { pendingAt: now.toISOString(), search: "?gclid=two" },
      },
      now: new Date("2026-08-31T10:01:00.000Z"),
    });
    expect(refused.consent.advertising).toBe(false);
    expect(refused.click).toBeNull();
  });

  it("does not store a click from an expired pending visit", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicGoogleAdsCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: {
          pendingAt: "2026-08-30T09:59:59.000Z",
          search: "?gclid=stale-click",
        },
      },
      now,
    });

    expect(allowed.consent.advertising).toBe(true);
    expect(allowed.click).toBeNull();
  });

  it("uses pending time only for freshness and captures a valid registration click at consent", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicGoogleAdsCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: { pendingAt: "2026-08-31T09:55:00.000Z", search: "?gclid=fresh-click" },
      },
      now,
    });

    expect(allowed.click?.capturedAt).toBe(now.toISOString());
    expect(
      RegistrationGoogleAdsAttributionSchema.safeParse({
        clickId: allowed.click?.value,
        clickIdKind: allowed.click?.kind,
        capturedAt: new Date(allowed.click?.capturedAt ?? 0),
        consentedAt: new Date(allowed.consent.decidedAt),
        expiresAt: new Date(allowed.expiresAt),
      }).success,
    ).toBe(true);
  });
});
