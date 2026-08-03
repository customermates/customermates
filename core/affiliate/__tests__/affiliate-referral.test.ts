import { describe, expect, it } from "vitest";

import { readAffiliateReferral, withAffiliateReferral } from "../affiliate-referral";

describe("readAffiliateReferral", () => {
  it("accepts a well-formed referral", () => {
    expect(readAffiliateReferral(new URL("https://customermates.com/en?aff=abc123_x-1"))).toBe("abc123_x-1");
  });

  it("ignores a missing or empty referral", () => {
    expect(readAffiliateReferral(new URL("https://customermates.com/en"))).toBeNull();
    expect(readAffiliateReferral(new URL("https://customermates.com/en?aff="))).toBeNull();
  });

  it("rejects values outside the allowed character set", () => {
    expect(readAffiliateReferral(new URL("https://customermates.com/en?aff=%3Cscript%3E"))).toBeNull();
    expect(readAffiliateReferral(new URL("https://customermates.com/en?aff=a%20b"))).toBeNull();
  });

  it("rejects an over-long referral", () => {
    const tooLong = "a".repeat(65);

    expect(readAffiliateReferral(new URL(`https://customermates.com/en?aff=${tooLong}`))).toBeNull();
  });
});

describe("withAffiliateReferral", () => {
  it("returns the checkout url unchanged without a referral", () => {
    expect(withAffiliateReferral("https://checkout.test/buy?x=1", null)).toBe("https://checkout.test/buy?x=1");
  });

  it("appends the referral while preserving existing query parameters", () => {
    const result = new URL(withAffiliateReferral("https://checkout.test/buy?x=1", "abc123"));

    expect(result.searchParams.get("x")).toBe("1");
    expect(result.searchParams.get("aff_ref")).toBe("abc123");
  });
});
