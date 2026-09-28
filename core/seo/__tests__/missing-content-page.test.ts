import { describe, expect, it } from "vitest";

import { isMissingContentPage, type ContentSlugManifest } from "../missing-content-page";

const manifest: ContentSlugManifest = {
  api: { en: ["list-contacts"], de: ["list-contacts"] },
  "blog-posts": { en: Array.from({ length: 30 }, (_, index) => `post-${index}`), de: ["post-0"] },
  "compare-pages": { en: ["pipedrive-alternative"], de: ["pipedrive-alternative"] },
  docs: { en: ["mcp"], de: ["mcp"] },
  "feature-pages": { en: ["pipeline"], de: ["pipeline"] },
  "for-pages": { en: ["electricians"], de: [] },
};

describe("isMissingContentPage", () => {
  it("flags a detail slug that has no content file in the locale", () => {
    expect(isMissingContentPage("/blog/unknown", "en", manifest)).toBe(true);
    expect(isMissingContentPage("/for/electricians", "de", manifest)).toBe(true);
    expect(isMissingContentPage("/docs/openapi/unknown", "en", manifest)).toBe(true);
  });

  it("passes existing detail pages, hub roots and reserved static segments", () => {
    expect(isMissingContentPage("/blog/post-3", "en", manifest)).toBe(false);
    expect(isMissingContentPage("/for/electricians/", "en", manifest)).toBe(false);
    expect(isMissingContentPage("/docs/openapi/list-contacts", "de", manifest)).toBe(false);
    expect(isMissingContentPage("/features/all", "en", manifest)).toBe(false);
    expect(isMissingContentPage("/docs/openapi", "en", manifest)).toBe(false);
    expect(isMissingContentPage("/blog", "en", manifest)).toBe(false);
    expect(isMissingContentPage("/pricing", "en", manifest)).toBe(false);
  });

  it("sizes hub pagination from the default locale, as the hub pages do", () => {
    expect(isMissingContentPage("/blog/page/2", "de", manifest)).toBe(false);
    expect(isMissingContentPage("/blog/page/3", "en", manifest)).toBe(true);
    expect(isMissingContentPage("/blog/page/1", "en", manifest)).toBe(true);
    expect(isMissingContentPage("/features/all/page/2junk", "en", manifest)).toBe(true);
    expect(isMissingContentPage("/compare/page/2", "en", manifest)).toBe(true);
  });
});
