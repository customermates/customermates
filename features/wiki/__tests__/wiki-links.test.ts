import { describe, expect, it } from "vitest";

import {
  localizeWikiPageUrls,
  parseWikiPageHref,
  parseWikiPageReference,
  wikiPageFetchId,
  wikiPageMarkdownLink,
  wikiPagePath,
  wikiPageUrl,
  workspaceWikiPagePath,
} from "../wiki-links";
import { externalizeWikiPageLinks, extractWikiPageLinks, hasInvalidWikiPageLinks } from "../wiki-markdown-links";
import { ROUTING_LOCALES } from "@/i18n/locale-registry";

const ID = "10000000-0000-4000-8000-000000000001";
const LINKED_ID = "10000000-0000-4000-8000-000000000002";
const BASE_URL = "https://app.customermates.com";
const SLUG = "acme";

describe("Wiki deep-link contract", () => {
  it.each(ROUTING_LOCALES)("accepts the %s app locale and canonicalizes it", (locale) => {
    expect(parseWikiPageHref(`/${locale}/wiki?page=${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
      slug: null,
    });
    expect(parseWikiPageHref(`/${locale}/w/${SLUG}/wiki?page=${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
      slug: SLUG,
    });
  });

  it("reads the workspace slug of qualified relative and same-origin links", () => {
    expect(parseWikiPageHref(`/w/${SLUG}/wiki?page=${ID}`)).toEqual({ id: ID, path: `/wiki?page=${ID}`, slug: SLUG });
    expect(parseWikiPageHref(`${BASE_URL}/w/beratung/wiki?page=${ID}`, BASE_URL)?.slug).toBe("beratung");
    expect(parseWikiPageHref(`/w/Not_A_Slug/wiki?page=${ID}`)).toBeNull();
    expect(parseWikiPageHref(`/w//wiki?page=${ID}`)).toBeNull();
  });

  it("renders a Markdown link whose title cannot break out of the link text", () => {
    expect(wikiPageMarkdownLink("Refunds", ID)).toBe(`[Refunds](/wiki?page=${ID})`);
    expect(wikiPageMarkdownLink("Plans [beta] \\ more", ID)).toBe(`[Plans \\[beta\\] \\\\ more](/wiki?page=${ID})`);
  });

  it("generates stable UUID paths, public URLs, and fetch ids", () => {
    expect(wikiPagePath(ID)).toBe(`/wiki?page=${ID}`);
    expect(workspaceWikiPagePath(SLUG, ID)).toBe(`/w/${SLUG}/wiki?page=${ID}`);
    expect(() => workspaceWikiPagePath("", ID)).toThrow();
    expect(wikiPageUrl(`${BASE_URL}/some/base/path`, SLUG, ID)).toBe(`${BASE_URL}/w/${SLUG}/wiki?page=${ID}`);
    expect(wikiPageFetchId(ID)).toBe(`wiki:${ID}`);
    expect(parseWikiPageReference(`wiki:${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
      slug: null,
    });
    expect(parseWikiPageReference(`${BASE_URL}/wiki?page=${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
      slug: null,
    });
    expect(parseWikiPageReference(`${BASE_URL}/w/${SLUG}/wiki?page=${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
      slug: SLUG,
    });
  });

  it.each([
    `https://other.example/wiki?page=${ID}`,
    `${BASE_URL}/wiki?page=${ID}#section`,
    `${BASE_URL}/wiki?page=${ID}&other=true`,
    `${BASE_URL}/wiki?page=${ID}&page=${LINKED_ID}`,
    `${BASE_URL}/wiki/${ID}`,
    `${BASE_URL}/foo/../wiki?page=${ID}`,
    `${BASE_URL}/%2e%2e/wiki?page=${ID}`,
    `${BASE_URL}//wiki?page=${ID}`,
    `${BASE_URL}/WIKI?page=${ID}`,
    `${BASE_URL}/wiki?PAGE=${ID}`,
    `${BASE_URL}/EN/wiki?page=${ID}`,
    `https://user:password@app.customermates.com/wiki?page=${ID}`,
    `/WIKI?page=${ID}`,
    `/wiki?PAGE=${ID}`,
    `/EN/wiki?page=${ID}`,
    `/pt/wiki?page=${ID}`,
    `//app.customermates.com/wiki?page=${ID}`,
    `\\app.customermates.com\\wiki?page=${ID}`,
    `/wiki?page=not-a-uuid`,
    `/wiki?page=10000000-0000-9000-8000-000000000001`,
    `/wiki?page=10000000-0000-4000-c000-000000000001`,
    `wiki:${ID}:extra`,
  ])("rejects ambiguous or foreign reference %s", (value) => {
    expect(parseWikiPageReference(value, BASE_URL)).toBeNull();
  });

  it("localizes only exact same-origin Wiki URLs", () => {
    const foreign = `https://other.example/wiki?page=${LINKED_ID}`;
    const invalidQuery = `${BASE_URL}/wiki?page=${ID}&other=true`;
    const invalidFragment = `${BASE_URL}/wiki?page=${ID}#fragment`;
    const invalidSuffix = `${BASE_URL}/wiki?page=${ID}extra`;
    const text = `Read ${BASE_URL}/wiki?page=${ID}; ignore ${foreign}. Keep ${invalidQuery}, ${invalidFragment}, and ${invalidSuffix}.`;
    expect(localizeWikiPageUrls(text, BASE_URL)).toBe(
      `Read /wiki?page=${ID}; ignore ${foreign}. Keep ${invalidQuery}, ${invalidFragment}, and ${invalidSuffix}.`,
    );
  });

  it("localizes qualified Wiki URLs of the bound workspace and keeps other workspaces' URLs", () => {
    const own = `${BASE_URL}/w/${SLUG}/wiki?page=${ID}`;
    const other = `${BASE_URL}/w/beratung/wiki?page=${LINKED_ID}`;
    expect(localizeWikiPageUrls(`See ${own} and ${other}.`, BASE_URL, SLUG)).toBe(`See /wiki?page=${ID} and ${other}.`);
    expect(localizeWikiPageUrls(`See ${own}.`, BASE_URL)).toBe(`See ${own}.`);
  });
});

describe("Wiki Markdown links", () => {
  it.each([
    "/wiki?page=...",
    `/pt/wiki?page=${ID}`,
    `/wiki?page=${ID}&other=true`,
    `/wiki?page=${ID}#section`,
    `${BASE_URL}/wiki?page=...`,
    `${BASE_URL}//wiki?page=${ID}`,
    `/wiki/${ID}`,
    `/w/${SLUG}/wiki?page=...`,
    `/w/${SLUG}/wiki/${ID}`,
  ])("rejects a malformed internal Markdown link %s", (href) => {
    expect(hasInvalidWikiPageLinks(`[Support](${href})`, BASE_URL)).toBe(true);
    expect(hasInvalidWikiPageLinks(`[Support][ref]\n\n[ref]: ${href}`, BASE_URL)).toBe(true);
  });

  it("allows exact internal paths, external links, the page list and code examples", () => {
    const markdown = [
      `[Support](/en/wiki?page=${ID})`,
      `[Support](${BASE_URL}/wiki?page=${ID})`,
      `[Support](/en/w/${SLUG}/wiki?page=${ID})`,
      "[External](https://other.example/wiki?page=...)",
      "[All pages](/wiki)",
      "`[Example](/wiki?page=...)`",
      "```md\n[Example](/wiki?page=...)\n```",
    ].join("\n\n");
    expect(hasInvalidWikiPageLinks(markdown, BASE_URL)).toBe(false);
  });

  it("externalizes real Wiki links without changing code literals", () => {
    const markdown = [
      `Read [Support](/de/wiki?page=${LINKED_ID}).`,
      "",
      `Inline code: \`[not a link](/wiki?page=${LINKED_ID})\``,
      "",
      "```md",
      `[also not a link](/wiki?page=${LINKED_ID})`,
      "```",
    ].join("\n");

    const projected = externalizeWikiPageLinks(markdown, BASE_URL, SLUG);
    expect(projected).toContain(`[Support](${BASE_URL}/w/${SLUG}/wiki?page=${LINKED_ID})`);
    expect(projected).toContain(`\`[not a link](/wiki?page=${LINKED_ID})\``);
    expect(projected).toContain(`[also not a link](/wiki?page=${LINKED_ID})`);

    expect(extractWikiPageLinks(markdown, BASE_URL, SLUG)).toEqual([
      {
        id: LINKED_ID,
        label: "Support",
        path: `/wiki?page=${LINKED_ID}`,
        url: `${BASE_URL}/w/${SLUG}/wiki?page=${LINKED_ID}`,
        fetchId: `wiki:${LINKED_ID}`,
      },
    ]);
  });

  it("resolves stored links with the source page's workspace and keeps explicitly qualified ones", () => {
    const markdown = `[Own](/wiki?page=${ID}) and [Other](/w/beratung/wiki?page=${LINKED_ID})`;
    const projected = externalizeWikiPageLinks(markdown, BASE_URL, SLUG);
    expect(projected).toContain(`[Own](${BASE_URL}/w/${SLUG}/wiki?page=${ID})`);
    expect(projected).toContain(`[Other](${BASE_URL}/w/beratung/wiki?page=${LINKED_ID})`);
    expect(extractWikiPageLinks(markdown, BASE_URL, SLUG).map((link) => link.id)).toEqual([ID]);
  });

  it("keeps links valid across title changes because identity is the UUID", () => {
    const beforeRename = `[Old title](/wiki?page=${LINKED_ID})`;
    const afterRename = `[New title](/wiki?page=${LINKED_ID})`;
    expect(extractWikiPageLinks(beforeRename, BASE_URL, SLUG)[0]?.id).toBe(LINKED_ID);
    expect(extractWikiPageLinks(afterRename, BASE_URL, SLUG)[0]?.id).toBe(LINKED_ID);
  });
});
