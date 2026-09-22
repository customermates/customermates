import { describe, expect, it } from "vitest";

import {
  createPublicPageReadState,
  publicPageSourcesWereRead,
  recordPublicPageLinks,
  reservePublicPageRead,
} from "../public-page-read-state";

const homepage = {
  url: "https://example.com/",
  registrableDomain: "example.com",
};

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

  it("accepts citations only for exact pages that were read successfully", () => {
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

    expect(
      publicPageSourcesWereRead(state, {
        pages: [
          {
            sources: ["https://example.com/#top", "https://example.com/about#team"],
          },
        ],
      }),
    ).toBe(true);
    expect(
      publicPageSourcesWereRead(state, {
        pages: [{ sources: ["https://example.com/failed"] }],
      }),
    ).toBe(false);
    expect(
      publicPageSourcesWereRead(state, {
        pages: [{ sources: ["https://example.com/guessed"] }],
      }),
    ).toBe(false);
    expect(publicPageSourcesWereRead(state, { pages: [{ sources: [] }] })).toBe(false);
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
    for (let index = 0; index < 4; index++) {
      expect(reservePublicPageRead(state, `https://example.com/page-${index}`).ok).toBe(true);
      recordPublicPageLinks(state, `https://example.com/page-${index}`, {
        ok: false,
      });
    }
    expect(reservePublicPageRead(state, "https://example.com/page-4")).toEqual({
      ok: false,
      reason: "page_limit",
    });
    expect(reservePublicPageRead(state, "https://example.com/page-0#retry")).toEqual({
      ok: false,
      reason: "already_attempted",
    });
    expect(state.attemptedUrls).toHaveLength(5);
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

  it("counts every allowed query variant toward the five-page attempt limit", () => {
    const state = startedState();
    recordPublicPageLinks(state, homepage.url, {
      ok: true,
      url: homepage.url,
      links: Array.from({ length: 5 }, (_, index) => ({
        url: `https://example.com/index.php?id=${index}`,
      })),
    });
    for (let index = 0; index < 4; index++)
      expect(reservePublicPageRead(state, `https://example.com/index.php?id=${index}`).ok).toBe(true);
    expect(reservePublicPageRead(state, "https://example.com/index.php?id=4")).toEqual({
      ok: false,
      reason: "page_limit",
    });
    expect(state.attemptedUrls).toHaveLength(5);
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
