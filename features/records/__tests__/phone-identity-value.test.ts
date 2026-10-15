import { describe, expect, it } from "vitest";

import { normalizePhoneNumber } from "@/core/utils/phone-number";

import { renormalizedPhoneIdentityValue } from "../phone-identity-value";

describe("phone identity values of earlier releases", () => {
  it("returns the current number for values the previous normalisers kept with a trunk prefix or a 00 prefix", () => {
    expect(renormalizedPhoneIdentityValue("+490301234567")).toBe("+49301234567");
    expect(renormalizedPhoneIdentityValue("+4906211234567")).toBe("+496211234567");
    expect(renormalizedPhoneIdentityValue("+410441234567")).toBe("+41441234567");
    expect(renormalizedPhoneIdentityValue("+0049301234567")).toBe("+49301234567");
    expect(renormalizedPhoneIdentityValue("+49 30 1234567")).toBe("+49301234567");
  });

  it("returns null for current values, kept leading zeros and numbers it cannot read", () => {
    for (const value of ["+49301234567", "+4915112345678", "+12025550123", "+390612345678"]) {
      expect(normalizePhoneNumber(value)).toBe(value);
      expect(renormalizedPhoneIdentityValue(value)).toBeNull();
    }
    for (const value of ["+0621123456", "+00", "+33012345678", "chat-ada", ""])
      expect(renormalizedPhoneIdentityValue(value)).toBeNull();
  });
});
