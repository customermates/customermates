import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SIGNUP_PATH, SIGNUP_TEMPLATE_QUERY_PARAM } from "../signup-link";
import { campaignValue, decodeJson, firstValue, isSameSite, parseHttpUrl } from "../signup-parsing";

describe("signup parsing", () => {
  it("takes the first value of a repeated query parameter", () => {
    expect(firstValue(["a", "b"])).toBe("a");
    expect(firstValue("a")).toBe("a");
    expect(firstValue(null)).toBeUndefined();
    expect(firstValue(undefined)).toBeUndefined();
  });

  it("keeps a plain campaign value and drops markup, control characters and anything too long", () => {
    expect(campaignValue(" google ")).toBe("google");
    expect(campaignValue(["en-connect", "x"])).toBe("en-connect");
    expect(campaignValue("<script>")).toBeNull();
    expect(campaignValue("a".repeat(129))).toBeNull();
    expect(campaignValue("")).toBeNull();
    expect(campaignValue(null)).toBeNull();
  });

  it("reads an http or https address and nothing else", () => {
    expect(parseHttpUrl("https://customermates.com/pricing")?.pathname).toBe("/pricing");
    expect(parseHttpUrl("http://localhost:4000/")?.host).toBe("localhost:4000");
    expect(parseHttpUrl("ftp://customermates.com/")).toBeNull();
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("not a url")).toBeNull();
    expect(parseHttpUrl(null)).toBeNull();
  });

  it("calls an address the same site when it has the host of the base address", () => {
    const base = "https://customermates.com";
    expect(isSameSite(parseHttpUrl("https://customermates.com/de/pricing"), base)).toBe(true);
    expect(isSameSite(parseHttpUrl("https://www.google.com/"), base)).toBe(false);
    expect(isSameSite(parseHttpUrl("https://customermates.com.evil.example/"), base)).toBe(false);
    expect(isSameSite(null, base)).toBe(false);
  });

  it("decodes JSON against a schema and answers null for anything else", () => {
    const schema = z.strictObject({ a: z.string() });
    expect(decodeJson(schema, '{"a":"x"}')).toEqual({ a: "x" });
    expect(decodeJson(schema, '{"a":1}')).toBeNull();
    expect(decodeJson(schema, "{")).toBeNull();
  });

  it("names the signup page and the template parameter once", () => {
    expect(SIGNUP_PATH).toBe("/auth/signup");
    expect(SIGNUP_TEMPLATE_QUERY_PARAM).toBe("template");
  });
});
