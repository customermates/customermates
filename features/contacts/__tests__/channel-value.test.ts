import { describe, it, expect } from "vitest";

import { inferChannelProviders, normalizeChannelValue, parseChannelHandle } from "../channel-value";

describe("inferChannelProviders", () => {
  it("returns mail for an email address", () => {
    expect(inferChannelProviders("jane@example.com")).toEqual(["mail"]);
  });

  it("returns the exact provider for a recognised profile URL", () => {
    expect(inferChannelProviders("https://linkedin.com/in/jane-doe")).toEqual(["linkedin"]);
    expect(inferChannelProviders("t.me/janedoe")).toEqual(["telegram"]);
    expect(inferChannelProviders("instagram.com/janedoe")).toEqual(["instagram"]);
  });

  it("returns whatsapp for a phone number", () => {
    expect(inferChannelProviders("+39 320 123 4567")).toEqual(["whatsapp"]);
  });

  it("returns every handle provider for an ambiguous handle", () => {
    expect(inferChannelProviders("janedoe")).toEqual(["linkedin", "telegram", "instagram"]);
    expect(inferChannelProviders("@jane.doe")).toEqual(["linkedin", "telegram", "instagram"]);
  });

  it("returns nothing for empty or unusable input", () => {
    expect(inferChannelProviders("")).toEqual([]);
    expect(inferChannelProviders("   ")).toEqual([]);
    expect(inferChannelProviders("has spaces inside")).toEqual([]);
  });
});

describe("normalizeChannelValue", () => {
  it("lowercases valid emails and rejects invalid ones", () => {
    expect(normalizeChannelValue("mail", "Jane@Example.com")).toBe("jane@example.com");
    expect(normalizeChannelValue("mail", "not-an-email")).toBeNull();
  });

  it("normalizes phone numbers to e164 and rejects non-e164", () => {
    expect(normalizeChannelValue("whatsapp", "+39 320 123 4567")).toBe("+393201234567");
    expect(normalizeChannelValue("whatsapp", "4915150799175")).toBe("+4915150799175");
    expect(normalizeChannelValue("whatsapp", "12")).toBeNull();
  });

  it("extracts the handle for handle providers", () => {
    expect(normalizeChannelValue("linkedin", "linkedin.com/in/jane-doe/")).toBe("jane-doe");
  });
});

describe("parseChannelHandle", () => {
  it("pulls the handle out of a profile URL and strips decoration", () => {
    expect(parseChannelHandle("linkedin", "https://linkedin.com/in/jane-doe/")).toBe("jane-doe");
    expect(parseChannelHandle("telegram", "@janedoe")).toBe("janedoe");
  });
});
