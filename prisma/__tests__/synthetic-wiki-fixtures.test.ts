import { describe, expect, it } from "vitest";

import { wikiExcerpt } from "@/features/wiki/wiki-content";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { WIKI_GUIDE_CONTEXT_MAX_BYTES, WikiPageInputSchema } from "@/features/wiki/wiki.schema";

import { SYNTHETIC_WIKI_PAGE_DEFINITIONS, SYNTHETIC_WIKI_PAGE_IDS } from "../seeds/wiki";

describe("synthetic Knowledge Base fixtures", () => {
  it("shows the Northwind Labs workspace with every page kind and the procedures Mate selects by trigger", () => {
    expect(SYNTHETIC_WIKI_PAGE_DEFINITIONS.map(({ title }) => title)).toEqual([
      "Operating Guide",
      "Product Fact Sheet",
      "Ideal Customer Profile",
      "Objection Handling",
      "Expansion and Upsell Plays",
      "Campaigns and Lead Sources",
      "Meeting Notes Template",
      "Sales Process",
      "Pricing and Discounts",
      "Customer Onboarding",
      "Renewal Playbook",
      "Support SLA and Escalation",
      "Email Tone and Templates",
      "Partner Program",
      "Hiring Process",
    ]);
    expect(SYNTHETIC_WIKI_PAGE_DEFINITIONS.filter(({ kind }) => kind === "guide")).toHaveLength(1);
    expect(SYNTHETIC_WIKI_PAGE_DEFINITIONS.filter(({ kind }) => kind === "knowledge")).toHaveLength(6);
    expect(SYNTHETIC_WIKI_PAGE_DEFINITIONS.filter(({ kind }) => kind === "procedure")).toHaveLength(8);
    expect(new Set(SYNTHETIC_WIKI_PAGE_DEFINITIONS.map(({ id }) => id))).toHaveLength(15);
    expect(new Set(SYNTHETIC_WIKI_PAGE_DEFINITIONS.map(({ sortOrder }) => sortOrder))).toHaveLength(15);
    expect(SYNTHETIC_WIKI_PAGE_DEFINITIONS[0]).toMatchObject({ kind: "guide", sortOrder: -1 });
    for (const { kind, title, whenToUse } of SYNTHETIC_WIKI_PAGE_DEFINITIONS) {
      if (kind === "procedure") expect(whenToUse, title).toMatch(/^When .{40,}\.$/u);
      else expect(whenToUse, title).toBeNull();
    }
    expect(JSON.stringify(SYNTHETIC_WIKI_PAGE_DEFINITIONS)).not.toMatch(/Customermates|consulting/iu);
  });

  it("passes the real editor and procedure validation with useful leading excerpts", () => {
    for (const { whenToUse, ...page } of SYNTHETIC_WIKI_PAGE_DEFINITIONS) {
      const result = WikiPageInputSchema.safeParse({ ...page, whenToUse: whenToUse ?? undefined });
      expect(result.success, page.title).toBe(true);
      expect(page.markdown).toMatch(/^\S.+\n\n## /u);
      expect(wikiExcerpt(page.markdown).length, page.title).toBeGreaterThan(70);
      if (result.success) {
        expect(extractWikiPageLinks(result.data.markdown, "http://localhost:4000")).toEqual(
          extractWikiPageLinks(page.markdown, "http://localhost:4000"),
        );
      }
    }
    const guide = SYNTHETIC_WIKI_PAGE_DEFINITIONS.find(({ kind }) => kind === "guide");
    if (!guide) throw new Error("Missing demo Operating Guide");

    expect(new TextEncoder().encode(guide.markdown).byteLength).toBeLessThanOrEqual(WIKI_GUIDE_CONTEXT_MAX_BYTES);
  });

  it("links only to existing fixture pages and leaves a custom guide replaceable", () => {
    const titles = new Map(SYNTHETIC_WIKI_PAGE_DEFINITIONS.map(({ id, title }) => [id, title]));
    for (const page of SYNTHETIC_WIKI_PAGE_DEFINITIONS) {
      const links = extractWikiPageLinks(page.markdown, "http://localhost:4000");
      expect(links.length, page.title).toBeGreaterThan(0);
      for (const link of links) {
        expect(titles.get(link.id), page.title).toBe(link.label);
        expect(link.id).not.toBe(SYNTHETIC_WIKI_PAGE_IDS.guide);
      }
    }
  });
});
