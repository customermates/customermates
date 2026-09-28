import { describe, expect, it } from "vitest";

import {
  localizeWikiPageUrls,
  parseWikiPageHref,
  parseWikiPageReference,
  wikiPageFetchId,
  wikiPagePath,
  wikiPageUrl,
} from "../wiki-links";
import { externalizeWikiPageLinks, extractWikiPageLinks } from "../wiki-markdown-links";
import { ROUTING_LOCALES } from "@/i18n/locale-registry";

const ID = "10000000-0000-4000-8000-000000000001";
const LINKED_ID = "10000000-0000-4000-8000-000000000002";
const BASE_URL = "https://app.customermates.com";

describe("Wiki deep-link contract", () => {
  it.each(ROUTING_LOCALES)("accepts the %s app locale and canonicalizes it", (locale) => {
    expect(parseWikiPageHref(`/${locale}/wiki?page=${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
    });
  });

  it("generates stable UUID paths, public URLs, and fetch ids", () => {
    expect(wikiPagePath(ID)).toBe(`/wiki?page=${ID}`);
    expect(wikiPageUrl(`${BASE_URL}/some/base/path`, ID)).toBe(`${BASE_URL}/wiki?page=${ID}`);
    expect(wikiPageFetchId(ID)).toBe(`wiki:${ID}`);
    expect(parseWikiPageReference(`wiki:${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
    });
    expect(parseWikiPageReference(`${BASE_URL}/wiki?page=${ID}`, BASE_URL)).toEqual({
      id: ID,
      path: `/wiki?page=${ID}`,
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
});

describe("Wiki Markdown links", () => {
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

    const projected = externalizeWikiPageLinks(markdown, BASE_URL);
    expect(projected).toContain(`[Support](${BASE_URL}/wiki?page=${LINKED_ID})`);
    expect(projected).toContain(`\`[not a link](/wiki?page=${LINKED_ID})\``);
    expect(projected).toContain(`[also not a link](/wiki?page=${LINKED_ID})`);

    expect(extractWikiPageLinks(markdown, BASE_URL)).toEqual([
      {
        id: LINKED_ID,
        label: "Support",
        path: `/wiki?page=${LINKED_ID}`,
        url: `${BASE_URL}/wiki?page=${LINKED_ID}`,
        fetchId: `wiki:${LINKED_ID}`,
      },
    ]);
  });

  it("keeps links valid across title changes because identity is the UUID", () => {
    const beforeRename = `[Old title](/wiki?page=${LINKED_ID})`;
    const afterRename = `[New title](/wiki?page=${LINKED_ID})`;
    expect(extractWikiPageLinks(beforeRename, BASE_URL)[0]?.id).toBe(LINKED_ID);
    expect(extractWikiPageLinks(afterRename, BASE_URL)[0]?.id).toBe(LINKED_ID);
  });
});
