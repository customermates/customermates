import { describe, expect, it } from "vitest";

import {
  createPublicPageReadState,
  normalizePublicPageSources,
  publicPageResearchProgress,
  recordPublicPageLinks,
  reservePublicPageRead,
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
    expect(publicPageResearchProgress(state)).toEqual({ complete: false, remaining: 1 });
    expect(reservePublicPageRead(state, "https://www.example.com/about")).toMatchObject({ ok: true });
    recordPublicPageLinks(state, "https://www.example.com/about", { ok: false });
    expect(publicPageResearchProgress(state)).toEqual({ complete: true, remaining: 0 });
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

  it("permits empty sources only on an unsupported setup page", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: [],
    });

    expect(
      normalizePublicPageSources(state, {
        action: "create",
        pages: [
          {
            sections: sections(),
            sources: [homepage.url],
          },
          {
            sections: [],
            sources: [],
          },
        ],
      }),
    ).toEqual({
      ok: true,
      input: {
        action: "create",
        pages: [
          {
            sections: sections(),
            sources: [homepage.url],
          },
          {
            sections: [],
            sources: [],
          },
        ],
      },
    });
    for (const page of [
      { sections: sections("Unsupported claim"), sources: [] },
      { sources: [] },
      { sections: "not an array", sources: [] },
    ]) {
      expect(normalizePublicPageSources(state, { pages: [page] })).toEqual({
        ok: false,
      });
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

  it("requires up to three linked reads to settle before setup can create pages", () => {
    const state = startedState();
    expect(publicPageResearchProgress(state)).toEqual({ complete: false, remaining: 0 });
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: Array.from({ length: 5 }, (_, index) => ({ url: `https://example.com/page-${index}` })),
    });
    expect(publicPageResearchProgress(state)).toEqual({ complete: false, remaining: 3 });

    for (let index = 0; index < 3; index++)
      expect(reservePublicPageRead(state, `https://example.com/page-${index}`).ok).toBe(true);

    expect(publicPageResearchProgress(state)).toEqual({ complete: false, remaining: 3 });
    recordPublicPageLinks(state, "https://example.com/page-0", { ok: false });
    recordPublicPageLinks(state, "https://example.com/page-1", {
      ok: true,
      url: "https://example.com/page-1",
      links: [],
    });
    recordPublicPageLinks(state, "https://example.com/page-2", { ok: false });
    expect(publicPageResearchProgress(state)).toEqual({ complete: true, remaining: 0 });
  });

  it("requires every available linked read when fewer than three exist", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: [{ url: "https://example.com/about" }],
    });
    expect(publicPageResearchProgress(state)).toEqual({ complete: false, remaining: 1 });
    expect(reservePublicPageRead(state, "https://example.com/about").ok).toBe(true);
    recordPublicPageLinks(state, "https://example.com/about", { ok: false });
    expect(publicPageResearchProgress(state)).toEqual({ complete: true, remaining: 0 });
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
