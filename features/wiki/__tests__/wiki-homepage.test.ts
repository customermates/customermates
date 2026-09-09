import { describe, expect, it } from "vitest";

import { buildWikiHomepageSetupPrompt, parsePublicDomainName, parsePublicWikiHomepage } from "../wiki-homepage";

describe("parsePublicWikiHomepage", () => {
  it.each([
    ["example.com", "https://example.com/", "example.com"],
    ["https://www.example.com/about?campaign=1#team", "https://www.example.com/about", "example.com"],
    ["http://shop.example.co.uk/catalog", "http://shop.example.co.uk/catalog", "example.co.uk"],
    ["tenant.github.io/docs", "https://tenant.github.io/docs", "tenant.github.io"],
    ["https://Example.COM./", "https://example.com/", "example.com"],
  ])("canonicalizes %s", (input, url, registrableDomain) => {
    expect(parsePublicWikiHomepage(input)).toEqual({ url, registrableDomain });
  });

  it.each([
    "",
    "ftp://example.com",
    "https://user:password@example.com",
    "https://example.com:8443",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://intranet.local",
    "https://example.invalid",
    "https://com",
  ])("rejects non-public or unsafe homepage %s", (input) => {
    expect(parsePublicWikiHomepage(input)).toBeNull();
  });

  it("accepts only exact public registrable domains for tool filters", () => {
    expect(parsePublicDomainName("example.com")).toBe("example.com");
    expect(parsePublicDomainName("tenant.github.io")).toBe("tenant.github.io");
    expect(parsePublicDomainName("www.example.com")).toBeNull();
    expect(parsePublicDomainName("localhost")).toBeNull();
  });
});

describe("buildWikiHomepageSetupPrompt", () => {
  it("requires one empty-only atomic five-page call and forbids invention", () => {
    const prompt = buildWikiHomepageSetupPrompt({
      url: "https://example.com/",
      registrableDomain: "example.com",
    });

    expect(prompt).toContain("exactly one manage_wiki_pages call");
    expect(prompt).toContain("requireEmpty=true");
    expect(prompt).toContain("exactly these five pages");
    expect(prompt).toContain("instead of guessing");
    expect(prompt).toContain("do not create any pages");
  });
});
