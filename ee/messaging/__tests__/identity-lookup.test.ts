import { describe, expect, it } from "vitest";
import { identityLookupValue } from "../identity-lookup";

describe("participant identity lookup", () => {
  it.each([
    ["mail", " Person@Example.test ", "person@example.test"],
    ["google", "person@example.test", "person@example.test"],
    ["outlook", " PERSON@example.test ", "person@example.test"],
    ["whatsapp", "+49 (151) 12345678", "+4915112345678"],
    ["whatsapp", "4915112345678", "+4915112345678"],
    ["whatsapp", "4915112345678@s.whatsapp.net", "+4915112345678"],
    ["whatsapp", "0049 151 12345678", "+4915112345678"],
    ["whatsapp", "123456789012345@lid", "123456789012345@lid"],
    ["phone", "+49 (0) 621 123456", "+49621123456"],
    ["phone", "0049 621 123456", "+49621123456"],
    ["phone", "0621 123456", "0621 123456"],
    ["linkedin", " https://www.linkedin.com/in/Zo%C3%AB/ ", "Zoë"],
    ["telegram", "@person", "person"],
    ["instagram", "https://instagram.com/person", "person"],
    ["linkedin", "urn:li:person:123", "urn:li:person:123"],
    ["linkedin", "opaque%broken", "opaque%broken"],
    ["telegram", "123456789", "123456789"],
    ["whatsapp", "not-a-number", "not-a-number"],
    ["mail", "invalid-address", "invalid-address"],
    ["mail", "  ", null],
    ["linkedin", null, null],
  ] as const)("normalizes %s identifier %s identically in the reader and writer", (provider, value, expected) => {
    expect(identityLookupValue(provider, value)).toBe(expected);
  });

  it("reads national phone numbers in the acting user's country", () => {
    expect(identityLookupValue("phone", "0621 123456", "de")).toBe("+49621123456");
    expect(identityLookupValue("phone", "(201) 555-0123", "us")).toBe("+12015550123");
    expect(identityLookupValue("whatsapp", "0621 123456", "de")).toBe("0621 123456");
  });
});
