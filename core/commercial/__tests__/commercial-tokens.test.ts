import { describe, expect, it } from "vitest";

import { contentLocaleFromPath, resolveCommercialTokens, resolveCommercialTokensDeep } from "../commercial-tokens";

describe("commercial content tokens", () => {
  it("resolves catalog prices, seat totals, trial days, and allowances in English", () => {
    expect(resolveCommercialTokens("[[commercial.price.starter.monthly]]", "en")).toBe("€12");
    expect(resolveCommercialTokens("[[commercial.price.pro.monthly.seats.5]]", "en")).toBe("€145");
    expect(resolveCommercialTokens("[[commercial.price.starter.monthly.seats.15.months.12]]", "en")).toBe("€2,160");
    expect(resolveCommercialTokens("[[commercial.trial.days]]", "en")).toBe("7");
    expect(resolveCommercialTokens("[[commercial.entitlement.business.includedAccountsPerUser]]", "en")).toBe("3");
    expect(resolveCommercialTokens("[[commercial.entitlement.enterprise.includedAccountsPerUser]]", "en")).toBe(
      "unlimited",
    );
  });

  it("localizes amounts and unlimited allowances in German", () => {
    expect(resolveCommercialTokens("[[commercial.price.pro.monthly]]", "de")).toMatch(/^29(?:\u00a0| )€$/);
    expect(resolveCommercialTokens("[[commercial.entitlement.enterprise.includedAccountsPerUser]]", "de")).toBe(
      "unbegrenzt",
    );
  });

  it("resolves nested frontmatter values without mutating non-string fields", () => {
    const publishedAt = new Date("2026-02-12T00:00:00.000Z");
    expect(
      resolveCommercialTokensDeep(
        {
          description: "From [[commercial.price.starter.monthly]]",
          enabled: true,
          publishedAt,
          rows: ["[[commercial.trial.days]]"],
        },
        "en",
      ),
    ).toEqual({ description: "From €12", enabled: true, publishedAt, rows: ["7"] });
  });

  it("rejects unsupported annual, unknown, malformed, and unlocalized tokens", () => {
    expect(() => resolveCommercialTokens("[[commercial.price.pro.annual]]", "en")).toThrow("unavailable");
    expect(() => resolveCommercialTokens("[[commercial.price.pro.weekly]]", "en")).toThrow("Invalid");
    expect(() => resolveCommercialTokens("[[commercial.price.pro.monthly.extra]]", "en")).toThrow("Invalid");
    expect(() => resolveCommercialTokens("[[commercial.price.pro.monthly.seats.5.extra]]", "en")).toThrow("Invalid");
    expect(() => resolveCommercialTokens("[[commercial.price.pro.monthly.seats.5.years.1]]", "en")).toThrow("Invalid");
    expect(() => resolveCommercialTokens("[[commercial.price.pro.monthly.seats.5.months.1.extra]]", "en")).toThrow(
      "Invalid",
    );
    expect(() => resolveCommercialTokens("[[commercial.unknown.value]]", "en")).toThrow("Unknown");
    expect(() => resolveCommercialTokens("[[commercial.entitlement.pro.includedAccountsPerUser.extra]]", "en")).toThrow(
      "Invalid",
    );
    expect(() => resolveCommercialTokens("[[commercial.price.pro.monthly", "en")).toThrow("Malformed");
    expect(() => contentLocaleFromPath("content/pricing/fr/pricing.mdx")).toThrow("Cannot resolve");
  });

  it("derives the content locale from localized source paths", () => {
    expect(contentLocaleFromPath("content/for-pages/en/example.mdx")).toBe("en");
    expect(contentLocaleFromPath("content/for-pages/de/example.mdx")).toBe("de");
  });
});
