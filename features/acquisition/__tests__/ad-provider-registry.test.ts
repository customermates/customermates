import { describe, expect, it } from "vitest";

import {
  AD_IDENTIFIER_KINDS,
  AD_PROVIDERS,
  AD_PROVIDER_ORDER,
  adClickExpiresAt,
  adClickRetentionDays,
  adProviderDisplayName,
  adProviderForIdentifierKind,
  isAdConversionReportable,
  isAdProvider,
} from "../ad-provider-registry";

describe("ad provider registry", () => {
  it("maps every identifier kind to exactly one provider", () => {
    expect(new Set(AD_IDENTIFIER_KINDS).size).toBe(AD_IDENTIFIER_KINDS.length);
    for (const kind of AD_IDENTIFIER_KINDS) expect(adProviderForIdentifierKind(kind)).not.toBeNull();
    expect(adProviderForIdentifierKind("fbclid")).toBeNull();
    expect(adProviderForIdentifierKind("cm_oppref")).toBeNull();
  });

  it("recognises only the registered providers", () => {
    for (const provider of AD_PROVIDER_ORDER) expect(isAdProvider(provider)).toBe(true);
    expect(isAdProvider("meta_ads")).toBe(false);
  });

  it("gives every provider a display name and a retention window", () => {
    for (const provider of AD_PROVIDER_ORDER) {
      expect(adProviderDisplayName(provider)).not.toHaveLength(0);
      expect(adClickRetentionDays(provider)).toBeGreaterThan(0);
    }
  });

  it("keeps each provider's identifier kind within the stored column width", () => {
    for (const kind of AD_IDENTIFIER_KINDS) expect(kind.length).toBeLessThanOrEqual(32);
  });

  it("derives expiry from the provider's own retention window", () => {
    const clickedAt = new Date("2026-09-02T10:00:00.000Z");
    expect(adClickExpiresAt("google_ads", clickedAt).toISOString()).toBe("2026-11-30T10:00:00.000Z");
    expect(adClickExpiresAt("openai_ads", clickedAt).toISOString()).toBe("2026-10-02T10:00:00.000Z");
  });

  it("stops reporting a Google conversion once the click leaves its window", () => {
    const clickedAt = new Date("2026-06-01T10:00:00.000Z");
    const conversionAt = new Date("2026-06-02T10:00:00.000Z");
    expect(
      isAdConversionReportable({
        provider: "google_ads",
        clickedAt,
        conversionAt,
        now: new Date("2026-08-28T09:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isAdConversionReportable({
        provider: "google_ads",
        clickedAt,
        conversionAt,
        now: new Date("2026-08-30T11:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("stops reporting an OpenAI conversion seven days after the conversion, not the click", () => {
    const clickedAt = new Date("2026-06-01T10:00:00.000Z");
    const conversionAt = new Date("2026-08-01T10:00:00.000Z");
    expect(
      isAdConversionReportable({
        provider: "openai_ads",
        clickedAt,
        conversionAt,
        now: new Date("2026-08-07T10:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isAdConversionReportable({
        provider: "openai_ads",
        clickedAt,
        conversionAt,
        now: new Date("2026-08-08T11:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("never reports a conversion that predates its click", () => {
    expect(
      isAdConversionReportable({
        provider: "reddit_ads",
        clickedAt: new Date("2026-09-02T10:00:00.000Z"),
        conversionAt: new Date("2026-09-01T10:00:00.000Z"),
        now: new Date("2026-09-02T11:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("declares a report window on every provider", () => {
    for (const provider of AD_PROVIDER_ORDER) {
      const definition = AD_PROVIDERS[provider];
      expect(definition.maxReportAgeFromClickSeconds ?? definition.maxReportAgeFromConversionSeconds).toBeGreaterThan(
        0,
      );
    }
  });
});
