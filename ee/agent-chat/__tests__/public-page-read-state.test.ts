import { describe, expect, it } from "vitest";

import {
  createPublicPageReadState,
  normalizePublicPageSources,
  recordPublicPageLinks,
  reservePublicPageRead,
  userWebsiteHomepage,
  userWebsiteHomepages,
} from "../public-page-read-state";

const homepage = {
  url: "https://example.com/",
  registrableDomain: "example.com",
};

function sections(content = "Verified facts") {
  return [{ heading: "Details", content }];
}

function startedState() {
  const state = createPublicPageReadState(homepage);
  expect(reservePublicPageRead(state, homepage.url)).toEqual({
    ok: true,
    url: homepage.url,
    allowedDomain: homepage.registrableDomain,
  });
  return state;
}

describe("public page read state", () => {
  it("requires the homepage before any linked or guessed page", () => {
    const state = createPublicPageReadState(homepage);
    expect(reservePublicPageRead(state, "https://example.com/about")).toEqual({
      ok: false,
      reason: "not_linked",
    });
    expect(state.attemptedUrls).toEqual([]);
  });

  it("admits only safe same-domain links from the original homepage", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: "https://example.com/en",
      links: [
        { url: "https://example.com/about?source=nav#team" },
        { url: "https://www.example.com/pricing" },
        { url: "https://example.com/en" },
        { url: "https://unrelated.com/" },
        { url: "https://127.0.0.1/" },
        { url: "https://example.com/about" },
      ],
    });
    expect(state.linkedUrls).toEqual([
      "https://example.com/about?source=nav",
      "https://www.example.com/pricing",
      "https://example.com/about",
    ]);
    expect(state.successfulUrls).toEqual(["https://example.com/en"]);
    expect(reservePublicPageRead(state, "https://example.com/about#team").ok).toBe(true);
    recordPublicPageLinks(state, "https://example.com/about", {
      ok: true,
      url: "https://example.com/about",
      links: [{ url: "https://example.com/secret-second-hop" }],
    });
    expect(reservePublicPageRead(state, "https://example.com/secret-second-hop")).toEqual({
      ok: false,
      reason: "not_linked",
    });
    expect(reservePublicPageRead(state, "https://unrelated.com/")).toEqual({
      ok: false,
      reason: "outside_domain",
    });
  });

  it("replaces fragment aliases with exact recorded URLs and deduplicates them", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: [{ url: "https://example.com/about" }, { url: "https://example.com/failed" }],
    });
    expect(reservePublicPageRead(state, "https://example.com/about").ok).toBe(true);
    recordPublicPageLinks(state, "https://example.com/about", {
      ok: true,
      url: "https://example.com/about#team",
      links: [],
    });
    expect(reservePublicPageRead(state, "https://example.com/failed").ok).toBe(true);
    recordPublicPageLinks(state, "https://example.com/failed", { ok: false });

    const input = {
      action: "create",
      pages: [
        {
          sections: sections(),
          sources: [
            "https://example.com/#top",
            "https://example.com/#another",
            "https://example.com/about#team",
            "https://example.com/about",
          ],
        },
      ],
    };
    expect(normalizePublicPageSources(state, input)).toEqual({
      ok: true,
      input: {
        action: "create",
        pages: [
          {
            sections: sections(),
            sources: ["https://example.com/", "https://example.com/about"],
          },
        ],
      },
    });
    expect(input.pages[0].sources).toEqual([
      "https://example.com/#top",
      "https://example.com/#another",
      "https://example.com/about#team",
      "https://example.com/about",
    ]);
  });

  it("accepts only a redirect's final successful URL", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: "https://www.example.com/en?locale=en#top",
      links: [],
    });

    expect(
      normalizePublicPageSources(state, {
        pages: [
          {
            sections: sections(),
            sources: ["https://www.example.com/en?locale=en#proof"],
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      input: {
        pages: [
          {
            sources: ["https://www.example.com/en?locale=en"],
          },
        ],
      },
    });
    expect(
      normalizePublicPageSources(state, {
        pages: [{ sections: sections("Facts"), sources: [homepage.url] }],
      }),
    ).toEqual({ ok: false });
  });

  it("does not require an already-attempted homepage alias after a redirect", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: "https://www.example.com/",
      links: [{ url: homepage.url }, { url: "https://www.example.com/" }, { url: "https://www.example.com/about" }],
    });

    expect(state.linkedUrls).toEqual(["https://www.example.com/about"]);
    expect(reservePublicPageRead(state, "https://www.example.com/about")).toMatchObject({ ok: true });
  });

  it("keeps distinct query URLs separate when validating sources", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: "https://example.com/index.php?id=42#overview",
      links: [],
    });

    expect(
      normalizePublicPageSources(state, {
        pages: [
          {
            sections: sections(),
            sources: ["https://example.com/index.php?id=42#details"],
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      input: {
        pages: [{ sources: ["https://example.com/index.php?id=42"] }],
      },
    });
    for (const source of ["https://example.com/index.php?id=43", "https://example.com/index.php"]) {
      expect(
        normalizePublicPageSources(state, {
          pages: [{ sections: sections("Facts"), sources: [source] }],
        }),
      ).toEqual({ ok: false });
    }
  });

  it("fails closed for unread, failed, malformed, or structurally invalid sources", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: [{ url: "https://example.com/failed" }],
    });
    expect(reservePublicPageRead(state, "https://example.com/failed").ok).toBe(true);
    recordPublicPageLinks(state, "https://example.com/failed", { ok: false });

    for (const input of [
      null,
      {},
      { pages: [] },
      { pages: [null] },
      { pages: [{ sections: sections("Facts") }] },
      { pages: [{ sections: sections("Facts"), sources: [42] }] },
      { pages: [{ sections: sections("Facts"), sources: ["not a URL"] }] },
      {
        pages: [
          {
            sections: sections("Facts"),
            sources: ["https://example.com/failed"],
          },
        ],
      },
      {
        pages: [
          {
            sections: sections("Facts"),
            sources: ["https://example.com/guessed"],
          },
        ],
      },
    ])
      expect(normalizePublicPageSources(state, input)).toEqual({ ok: false });
  });

  it("requires every setup page to cite a read source for its sections", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: [],
    });

    for (const page of [
      { sections: [], sources: [] },
      { sections: sections("Unsupported claim"), sources: [] },
      { sections: [], sources: [homepage.url] },
      { sources: [homepage.url] },
      { sections: "not an array", sources: [homepage.url] },
    ]) {
      expect(
        normalizePublicPageSources(state, { pages: [{ sections: sections(), sources: [homepage.url] }, page] }),
      ).toEqual({ ok: false });
    }
  });

  it("counts failed attempts, rejects retries, and reserves synchronously before parallel work", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: Array.from({ length: 6 }, (_, index) => ({
        url: `https://example.com/page-${index}`,
      })),
    });
    for (let index = 0; index < 3; index++) {
      expect(reservePublicPageRead(state, `https://example.com/page-${index}`).ok).toBe(true);
      recordPublicPageLinks(state, `https://example.com/page-${index}`, {
        ok: false,
      });
    }
    expect(reservePublicPageRead(state, "https://example.com/page-3")).toEqual({
      ok: false,
      reason: "page_limit",
    });
    expect(reservePublicPageRead(state, "https://example.com/page-0#retry")).toEqual({
      ok: false,
      reason: "already_attempted",
    });
    expect(state.attemptedUrls).toHaveLength(4);
  });

  it("marks the homepage as read after its first successful attempt without requiring follow-up reads", () => {
    const state = startedState();
    expect(state.homepageSucceeded).toBe(false);
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: Array.from({ length: 5 }, (_, index) => ({ url: `https://example.com/page-${index}` })),
    });
    expect(state.homepageSucceeded).toBe(true);
    expect(state.linkedUrls).toHaveLength(5);
    expect(state.attemptedUrls).toEqual([homepage.url]);
  });

  it("keeps query-addressed pages distinct while deduplicating their fragments", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: [
        { url: "https://example.com/index.php?id=42#overview" },
        { url: "https://example.com/index.php?id=42#details" },
        { url: "https://example.com/index.php?id=43" },
      ],
    });
    expect(state.linkedUrls).toEqual(["https://example.com/index.php?id=42", "https://example.com/index.php?id=43"]);
    expect(reservePublicPageRead(state, "https://example.com/index.php?id=42#details")).toEqual({
      ok: true,
      url: "https://example.com/index.php?id=42",
      allowedDomain: "example.com",
    });
    expect(reservePublicPageRead(state, "https://example.com/index.php?id=43").ok).toBe(true);
    expect(reservePublicPageRead(state, "https://example.com/index.php?id=42#again")).toEqual({
      ok: false,
      reason: "already_attempted",
    });
    expect(reservePublicPageRead(state, "https://example.com/index.php?id=44")).toEqual({
      ok: false,
      reason: "not_linked",
    });
    expect(reservePublicPageRead(state, "https://example.com/index.php?id=42&retry=1")).toEqual({
      ok: false,
      reason: "not_linked",
    });
    expect(state.attemptedUrls).toHaveLength(3);
  });

  it("counts every allowed query variant toward the four-page attempt limit", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: Array.from({ length: 5 }, (_, index) => ({
        url: `https://example.com/index.php?id=${index}`,
      })),
    });
    for (let index = 0; index < 3; index++)
      expect(reservePublicPageRead(state, `https://example.com/index.php?id=${index}`).ok).toBe(true);

    expect(reservePublicPageRead(state, "https://example.com/index.php?id=3")).toEqual({
      ok: false,
      reason: "page_limit",
    });
    expect(state.attemptedUrls).toHaveLength(4);
  });

  it("does not admit pages after an unsuccessful homepage read or duplicate homepage attempt", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, { ok: false });
    expect(state.homepageSucceeded).toBe(false);
    expect(reservePublicPageRead(state, homepage.url)).toEqual({
      ok: false,
      reason: "already_attempted",
    });
    expect(reservePublicPageRead(state, "https://example.com/about")).toEqual({
      ok: false,
      reason: "not_linked",
    });
  });

  it("retains its bounds after JSON serialization for durable workflow replay", () => {
    const state = JSON.parse(JSON.stringify(startedState()));
    expect(reservePublicPageRead(state, homepage.url)).toEqual({
      ok: false,
      reason: "already_attempted",
    });
    expect(reservePublicPageRead(state, "file:///etc/passwd")).toEqual({
      ok: false,
      reason: "invalid_url",
    });
  });
});

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

  it("keeps follow-up reads on links the chosen homepage returned", () => {
    const chosen = userWebsiteHomepage(["https://acme-widgets.com/"], "acme-widgets.com");
    if (!chosen) throw new Error("Expected a homepage.");
    const state = createPublicPageReadState(chosen);

    expect(reservePublicPageRead(state, "https://acme-widgets.com/pricing")).toEqual({
      ok: false,
      reason: "not_linked",
    });
    expect(reservePublicPageRead(state, chosen.url)).toMatchObject({ ok: true, url: chosen.url });
  });
});
