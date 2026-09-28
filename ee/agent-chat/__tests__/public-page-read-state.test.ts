import { describe, expect, it } from "vitest";

import { userWebsiteHomepage, userWebsiteHomepages } from "../public-page-read-state";

describe("user-supplied website homepages", () => {
  it("extracts canonical homepages from what the user typed", () => {
    expect(
      userWebsiteHomepages([
        "Build my Wiki from my company website.",
        "Sure: it's acme-widgets.com. Our docs live at https://docs.acme-widgets.com/start?x=1 (mail me at ada@acme-widgets.com)",
        "e.g. or v1.2 are not websites",
      ]),
    ).toEqual(["https://acme-widgets.com/", "https://docs.acme-widgets.com/start"]);
  });

  it("accepts the exact canonical URL or a host the user wrote, and nothing else", () => {
    const homepages = userWebsiteHomepages(["Our site is acme-widgets.com/about"]);

    expect(userWebsiteHomepage(homepages, "http://acme-widgets.com/about")).toEqual({
      url: "https://acme-widgets.com/about",
      registrableDomain: "acme-widgets.com",
    });
    expect(userWebsiteHomepage(homepages, "https://acme-widgets.com")?.url).toBe("https://acme-widgets.com/");
    expect(userWebsiteHomepage(homepages, "https://www.acme-widgets.com/")).toBeNull();
    expect(userWebsiteHomepage(homepages, "https://acme-widgets.com.evil-site.com/")).toBeNull();
    expect(userWebsiteHomepage(homepages, "https://evil-site.com/")).toBeNull();
    expect(userWebsiteHomepage([], "https://acme-widgets.com/")).toBeNull();
  });

  it("never treats an email address as a website", () => {
    const homepages = userWebsiteHomepages(["Draft a reply to john@evil-partner.com", "mail ada@acme.io."]);

    expect(homepages).toEqual([]);
    expect(userWebsiteHomepage(homepages, "https://evil-partner.com/c/Acme-deal-EUR-250000")).toBeNull();
  });

  it("chooses only the host root when the requested path was not written by the user", () => {
    const homepages = userWebsiteHomepages(["Our site is acme-widgets.com/about"]);
    const chosen = userWebsiteHomepage(homepages, "https://acme-widgets.com/c/Acme-deal-EUR-250000");

    expect(chosen).toEqual({ url: "https://acme-widgets.com/", registrableDomain: "acme-widgets.com" });
  });
});
