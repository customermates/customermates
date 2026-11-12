import { describe, expect, it } from "vitest";

import {
  SIGNUP_LAST_PAGE_MAX_LENGTH,
  SignupLastPageSchema,
  isSignupLastPage,
  signupLastPageFromReferer,
} from "../signup-last-page";
import { signupLastPageFromRequest, signupRequestFromRequest } from "../signup-source";

const BASE_URL = "https://customermates.com";

function lastPage(referer: string | null) {
  return signupLastPageFromReferer({ referer, baseUrl: BASE_URL });
}

describe("the last page before signup, read from the Referer header", () => {
  it("keeps the path of a same-site page and drops query values and the fragment", () => {
    expect(lastPage("https://customermates.com/en/for/law-firms?utm_source=x&email=a%40b.c#pricing")).toBe(
      "/en/for/law-firms",
    );
  });

  it("keeps the template query value of a known template and nothing else", () => {
    expect(lastPage("https://customermates.com/en/templates?template=Law-Firm-Intake&ref=1")).toBe(
      "/en/templates?template=law-firm-intake",
    );
    expect(lastPage("https://customermates.com/en/templates?template=not-a-template")).toBe("/en/templates");
  });

  it.each([
    ["an external page", "https://www.google.com/search?q=customermates"],
    ["a subdomain of the site", "https://www.customermates.com/en"],
    ["a non-web scheme", "javascript:alert(1)"],
    ["a malformed address", "not a url"],
    ["no referer", null],
  ])("records nothing for %s", (_, referer) => {
    expect(lastPage(referer)).toBeNull();
  });

  it("replaces identifiers and long opaque segments in the path", () => {
    expect(lastPage("https://customermates.com/p/3f2b8c1e-7a41-4d3e-9c55-0a1b2c3d4e5f/view")).toBe("/p/:id/view");
    expect(lastPage("https://customermates.com/public/aB3dE5gH7jK9mN2pQ4rS6tU8vW0x/form")).toBe("/public/:id/form");
    expect(lastPage("https://customermates.com/blog/how-to-follow-up-on-every-client-conversation")).toBe(
      "/blog/how-to-follow-up-on-every-client-conversation",
    );
  });

  it("records nothing when the path is longer than the column", () => {
    expect(lastPage(`https://customermates.com/${"a".repeat(SIGNUP_LAST_PAGE_MAX_LENGTH)}`)).toBeNull();
  });
});

describe("signup last page validation", () => {
  it.each(["/", "/en/for/consultants", "/en/templates?template=client-tracker"])("accepts %s", (value) => {
    expect(isSignupLastPage(value)).toBe(true);
    expect(SignupLastPageSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["a full URL", "https://customermates.com/en"],
    ["a protocol-relative URL", "//evil.example/en"],
    ["a path with whitespace", "/en /for"],
    ["a control character", "/en/\u0000for"],
    ["a query other than template", "/en?utm_source=x"],
    ["an unknown template", "/en?template=nope"],
    ["two queries", "/en?template=client-tracker?x=1"],
    ["a fragment", "/en#pricing"],
    ["no leading slash", "en/for"],
    ["an empty string", ""],
  ])("rejects %s", (_, value) => {
    expect(isSignupLastPage(value)).toBe(false);
  });
});

describe("the signup request carried by the signup form", () => {
  it("adds the last page to the journey of the signup request", () => {
    expect(
      signupRequestFromRequest({
        searchParams: { template: "client-tracker" },
        referer: "https://customermates.com/en/templates/client-tracker?x=1",
        baseUrl: BASE_URL,
      }),
    ).toMatchObject({
      template: "client-tracker",
      landingPath: "/en/templates/client-tracker",
      lastPage: "/en/templates/client-tracker",
    });
  });

  it("keeps the last page without a consent when no campaign data is present", () => {
    expect(
      signupRequestFromRequest({ searchParams: {}, referer: "https://customermates.com/en/pricing", baseUrl: BASE_URL })
        .lastPage,
    ).toBe("/en/pricing");
  });

  it("reads only a valid last page back from what the form posts", () => {
    expect(signupLastPageFromRequest({ lastPage: "/en/pricing", job: "admin" })).toBe("/en/pricing");
    expect(signupLastPageFromRequest({ lastPage: "https://evil.example/" })).toBeNull();
    expect(signupLastPageFromRequest({ lastPage: null })).toBeNull();
    expect(signupLastPageFromRequest(undefined)).toBeNull();
    expect(signupLastPageFromRequest("a string")).toBeNull();
  });
});
