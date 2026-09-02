import { describe, expect, it } from "vitest";

import {
  RegistrationAdAttributionSchema,
  buildPublicAdAttributionCookieDecision,
  hasPendingAdClick,
  normalizeAdClick,
  preserveAdClickInHref,
  removeAdClickFromHref,
} from "../ad-attribution.schema";

const NOTICE_VERSION = "2026-09-02";

describe("ad click normalization", () => {
  it.each([
    ["gclid", "google_ads"],
    ["gbraid", "google_ads"],
    ["wbraid", "google_ads"],
    ["oppref", "openai_ads"],
    ["rdt_cid", "reddit_ads"],
    ["li_fat_id", "linkedin_ads"],
  ] as const)("preserves one case-sensitive %s and resolves its provider", (kind, provider) => {
    expect(normalizeAdClick({ search: `?${kind}=Case-Sensitive_~.%2B` }, new Date("2026-08-31T10:00:00Z"))).toEqual({
      provider,
      kind,
      value: "Case-Sensitive_~.+",
      clickedAt: "2026-08-31T10:00:00.000Z",
    });
  });

  it.each([
    "?utm_source=google&utm_medium=cpc",
    "?gclid=",
    "?gclid=one&gclid=two",
    "?gclid=one&wbraid=two",
    "?gclid=one&oppref=two",
    "?oppref=one&rdt_cid=two",
    "?li_fat_id=one&li_fat_id=two",
    "?gclid=one&gclid=two&wbraid=three",
    "?gclid=contains%20space",
    "?gclid=contains%C2%A0space",
    "?gclid=contains%E2%80%AEformat",
  ])("rejects ambiguous or absent click identifiers in %s", (search) => {
    expect(normalizeAdClick({ search })).toBeNull();
  });

  it("rejects an oversized identifier and accepts one at the limit", () => {
    expect(normalizeAdClick({ search: `?oppref=${"a".repeat(513)}` })).toBeNull();
    expect(normalizeAdClick({ search: `?oppref=${"a".repeat(512)}` })?.value).toHaveLength(512);
  });

  it("keeps one undecided click in same-origin navigation URLs without carrying campaign fields", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(
      preserveAdClickInHref(
        "/en/privacy?section=advertising#choices",
        { search: "?utm_campaign=cloud-crm&gclid=Case-Sensitive_~.%2B", pendingAt: now.toISOString() },
        now,
      ),
    ).toBe("/en/privacy?section=advertising&gclid=Case-Sensitive_%7E.%2B&cm_ads_pending=1788170400#choices");
    expect(
      preserveAdClickInHref("/en/privacy", { search: "?oppref=opaque-value", pendingAt: now.toISOString() }, now),
    ).toBe("/en/privacy?oppref=opaque-value&cm_ads_pending=1788170400");
    expect(preserveAdClickInHref("https://example.com/privacy", { search: "?gclid=paid-click" })).toBe(
      "https://example.com/privacy",
    );
  });

  it("recognizes only one marked pending click", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(hasPendingAdClick({ search: "?gclid=one&cm_ads_pending=1788170400" }, now)).toBe(true);
    expect(hasPendingAdClick({ search: "?gclid=one" }, now)).toBe(false);
    expect(hasPendingAdClick({ search: "?gclid=one&cm_ads_pending=1788170400&cm_ads_pending=1788170400" }, now)).toBe(
      false,
    );
    expect(hasPendingAdClick({ search: "?cm_ads_pending=1788170400" }, now)).toBe(false);
    expect(hasPendingAdClick({ search: "?gclid=one&cm_ads_pending=1788084000" }, now)).toBe(true);
    expect(hasPendingAdClick({ search: "?gclid=one&cm_ads_pending=1788083999" }, now)).toBe(false);
    expect(hasPendingAdClick({ search: "?gclid=one&cm_ads_pending=1788170700" }, now)).toBe(true);
    expect(hasPendingAdClick({ search: "?gclid=one&cm_ads_pending=1788170701" }, now)).toBe(false);
  });

  it("does not refresh an explicitly expired pending visit", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    expect(
      preserveAdClickInHref(
        "/en/privacy",
        { pendingAt: "2026-08-30T09:59:59.000Z", search: "?gclid=stale-click" },
        now,
      ),
    ).toBe("/en/privacy");
  });

  it("removes every provider's click identifier after the visitor decides", () => {
    expect(
      removeAdClickFromHref(
        "/de/privacy?section=advertising&gclid=one&gbraid=two&wbraid=three&oppref=four&rdt_cid=five&li_fat_id=six&cm_ads_pending=1788170400#choices",
      ),
    ).toBe("/de/privacy?section=advertising#choices");
  });

  it("stores only the click after consent and removes every click after refusal", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicAdAttributionCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: { pendingAt: now.toISOString(), search: "?gclid=one&utm_campaign=ignored" },
      },
      noticeVersion: NOTICE_VERSION,
      now,
    });
    expect(allowed.clicks).toHaveLength(1);
    expect(allowed.clicks[0]).toMatchObject({ provider: "google_ads", kind: "gclid", value: "one" });
    expect(allowed.consent.noticeVersion).toBe(NOTICE_VERSION);
    expect(JSON.stringify(allowed)).not.toContain("utm_campaign");

    const refused = buildPublicAdAttributionCookieDecision({
      existing: allowed,
      input: { choice: "necessary-only", visit: { pendingAt: now.toISOString(), search: "?gclid=two" } },
      noticeVersion: NOTICE_VERSION,
      now: new Date("2026-08-31T10:01:00.000Z"),
    });
    expect(refused.consent.advertising).toBe(false);
    expect(refused.clicks).toEqual([]);
  });

  it("does not store a click from an expired pending visit", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicAdAttributionCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: { pendingAt: "2026-08-30T09:59:59.000Z", search: "?gclid=stale-click" },
      },
      noticeVersion: NOTICE_VERSION,
      now,
    });

    expect(allowed.consent.advertising).toBe(true);
    expect(allowed.clicks).toEqual([]);
  });

  it("records the click time separately from the capture time", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const allowed = buildPublicAdAttributionCookieDecision({
      existing: null,
      input: {
        choice: "allow-attribution",
        visit: { pendingAt: "2026-08-31T09:55:00.000Z", search: "?gclid=fresh-click" },
      },
      noticeVersion: NOTICE_VERSION,
      now,
    });

    const click = allowed.clicks[0];
    expect(click?.clickedAt).toBe("2026-08-31T09:55:00.000Z");
    expect(click?.capturedAt).toBe(now.toISOString());
    expect(
      RegistrationAdAttributionSchema.safeParse({
        provider: click?.provider,
        identifierKind: click?.kind,
        identifierValue: click?.value,
        clickedAt: new Date(click?.clickedAt ?? 0),
        capturedAt: new Date(click?.capturedAt ?? 0),
        consentedAt: new Date(allowed.consent.decidedAt),
        consentNoticeVersion: allowed.consent.noticeVersion,
        expiresAt: new Date(click?.expiresAt ?? 0),
      }).success,
    ).toBe(true);
  });

  it("expires each provider's identifier on its own retention window", () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const expiryFor = (search: string) => {
      const cookie = buildPublicAdAttributionCookieDecision({
        existing: null,
        input: { choice: "allow-attribution", visit: { pendingAt: now.toISOString(), search } },
        noticeVersion: NOTICE_VERSION,
        now,
      });
      return cookie.clicks[0]?.expiresAt;
    };

    expect(expiryFor("?gclid=one")).toBe("2026-11-28T10:00:00.000Z");
    expect(expiryFor("?li_fat_id=one")).toBe("2026-11-28T10:00:00.000Z");
    expect(expiryFor("?oppref=one")).toBe("2026-09-30T10:00:00.000Z");
    expect(expiryFor("?rdt_cid=one")).toBe("2026-09-30T10:00:00.000Z");
  });

  it("replaces a later click for the same provider and leaves other providers untouched", () => {
    const first = new Date("2026-08-31T10:00:00.000Z");
    const withGoogle = buildPublicAdAttributionCookieDecision({
      existing: null,
      input: { choice: "allow-attribution", visit: { pendingAt: first.toISOString(), search: "?gclid=first" } },
      noticeVersion: NOTICE_VERSION,
      now: first,
    });

    const second = new Date("2026-09-01T10:00:00.000Z");
    const withOpenAi = buildPublicAdAttributionCookieDecision({
      existing: withGoogle,
      input: { choice: "allow-attribution", visit: { pendingAt: second.toISOString(), search: "?oppref=chat" } },
      noticeVersion: NOTICE_VERSION,
      now: second,
    });
    expect(withOpenAi.clicks.map((click) => click.value).sort()).toEqual(["chat", "first"]);

    const third = new Date("2026-09-02T10:00:00.000Z");
    const replaced = buildPublicAdAttributionCookieDecision({
      existing: withOpenAi,
      input: { choice: "allow-attribution", visit: { pendingAt: third.toISOString(), search: "?gclid=second" } },
      noticeVersion: NOTICE_VERSION,
      now: third,
    });

    expect(replaced.clicks.filter((click) => click.provider === "google_ads").map((click) => click.value)).toEqual([
      "second",
    ]);
    expect(replaced.clicks.filter((click) => click.provider === "openai_ads").map((click) => click.value)).toEqual([
      "chat",
    ]);
    expect(replaced.consent.decidedAt).toBe(withGoogle.consent.decidedAt);
  });
});

describe("consent notice versioning", () => {
  const now = new Date("2026-09-02T10:00:00.000Z");

  const consentedUnder = (noticeVersion: string) =>
    buildPublicAdAttributionCookieDecision({
      existing: null,
      input: { choice: "allow-attribution", visit: { pendingAt: now.toISOString(), search: "?gclid=one" } },
      noticeVersion,
      now,
    });

  it("keeps an unexpired decision while the notice it was given for is current", () => {
    const existing = consentedUnder(NOTICE_VERSION);
    const later = new Date("2026-09-03T10:00:00.000Z");

    const next = buildPublicAdAttributionCookieDecision({
      existing,
      input: { choice: "allow-attribution", visit: { pendingAt: later.toISOString(), search: "?oppref=chat" } },
      noticeVersion: NOTICE_VERSION,
      now: later,
    });

    expect(next.consent.decidedAt).toBe(existing.consent.decidedAt);
    expect(next.clicks).toHaveLength(2);
  });

  it("does not let a decision given for an older notice authorise the current one", () => {
    const existing = consentedUnder("2026-08-31");
    const later = new Date("2026-09-03T10:00:00.000Z");

    const next = buildPublicAdAttributionCookieDecision({
      existing,
      input: { choice: "allow-attribution", visit: { pendingAt: later.toISOString(), search: "?oppref=chat" } },
      noticeVersion: NOTICE_VERSION,
      now: later,
    });

    expect(next.consent.noticeVersion).toBe(NOTICE_VERSION);
    expect(next.consent.decidedAt).toBe(later.toISOString());
    expect(next.clicks.map((click) => click.provider)).toEqual(["openai_ads"]);
  });
});
