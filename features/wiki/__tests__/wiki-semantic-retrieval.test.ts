import { describe, expect, it } from "vitest";

import { fuseWikiSearchCandidates } from "../wiki-hybrid-ranking";
import { WIKI_SEMANTIC_CHUNK_MAX_LENGTH, wikiSemanticChunks } from "../wiki-chunks";
import { parseWikiSearchQuery, wikiCompact, wikiIdentifierPattern, wikiSearchMatch } from "../wiki-search";

const keyword = (id: string, flags: { allTerms?: boolean; identifier?: boolean } = {}) => ({
  id,
  allTerms: flags.allTerms ?? false,
  identifier: flags.identifier ?? false,
});
const semantic = (id: string, offset = 0, similarity = 0.7) => ({ id, offset, similarity });

describe("fuseWikiSearchCandidates", () => {
  it("keeps the semantic order and its section offsets when no identifier matched", () => {
    const ranked = fuseWikiSearchCandidates(
      [semantic("refunds", 40), semantic("expenses", 12)],
      [keyword("expenses", { allTerms: true }), keyword("refunds")],
      new Set(),
    );

    expect(ranked).toEqual([
      { id: "refunds", offset: 40 },
      { id: "expenses", offset: 12 },
    ]);
  });

  it("puts pages that contain a queried identifier first, ordered by meaning, without a semantic offset", () => {
    const ranked = fuseWikiSearchCandidates(
      [semantic("runbook", 5), semantic("incident", 9), semantic("postmortem", 3)],
      [keyword("postmortem", { identifier: true }), keyword("incident", { identifier: true })],
      new Set(),
    );

    expect(ranked).toEqual([{ id: "incident" }, { id: "postmortem" }, { id: "runbook", offset: 5 }]);
  });

  it("lets confident keyword matches on not yet indexed pages compete, and appends the remaining keyword tail", () => {
    const ranked = fuseWikiSearchCandidates(
      [semantic("indexed", 7)],
      [keyword("fresh", { allTerms: true }), keyword("indexed-tail", { allTerms: true }), keyword("weak")],
      new Set(["fresh"]),
    );

    expect(ranked.map(({ id }) => id)).toEqual(["indexed", "fresh", "indexed-tail", "weak"]);
  });
});

describe("Wiki identifier terms", () => {
  const identifiers = (query: string) => parseWikiSearchQuery(query).identifierTerms;

  it("matches codes regardless of separators and case", () => {
    expect(identifiers("E4012 error")).toEqual(["e4012"]);
    expect(identifiers("E-4012")).toEqual(["e4012"]);
    expect(identifiers("billing-escalations@brightlane.io")).toEqual(["billingescalationsbrightlaneio"]);
    expect(identifiers("v4.12.3 release")).toEqual(["v4123"]);
    expect(wikiCompact("Ticket OPS-1182, see v4.12.3")).toContain("ops1182");
  });

  it("joins a number with the word before it, and with the word after it only for legal references", () => {
    expect(identifiers("ops 1182")).toEqual(["1182", "ops1182"]);
    expect(identifiers("hr form 17")).toEqual(["hrform17", "form17"]);
    expect(identifiers("§ 622 BGB")).toEqual(["622", "622bgb"]);
    expect(identifiers("refund 3 weeks after purchase")).toEqual([]);
    expect(identifiers("Nachlässe über 20 Prozent")).toEqual(["nachlässeüber20", "über20"]);
    expect(wikiCompact("Refund within 30 days")).not.toMatch(new RegExp(wikiIdentifierPattern("refund3"), "u"));
    expect(wikiCompact("Budget über 2000 Euro")).not.toMatch(new RegExp(wikiIdentifierPattern("über20"), "u"));
  });

  it("chooses the section that contains the identifier", () => {
    const markdown = "## Overview\n\nGeneral notes.\n\n## Errors\n\nError E-4012 means the sync token expired.";
    expect(wikiSearchMatch(markdown, parseWikiSearchQuery("E4012")).section).toBe("Errors");
  });

  it("honours a preferred section offset from semantic retrieval", () => {
    const markdown = "## Overview\n\nRefund basics.\n\n## Annual plans\n\nProrated within 30 days.";
    const offset = markdown.indexOf("## Annual plans");
    expect(wikiSearchMatch(markdown, parseWikiSearchQuery("money back"), offset)).toMatchObject({
      section: "Annual plans",
      offset,
    });
  });
});

describe("wikiSemanticChunks", () => {
  it("labels each section chunk with the page title and heading, drops link targets, and keeps section offsets", () => {
    const markdown = "Intro text.\n\n## Refunds\n\nSee [the policy](/wiki?page=abc) for details.";
    const chunks = wikiSemanticChunks("Billing", markdown);

    expect(chunks.map(({ text, offset, section }) => ({ text, offset, section }))).toEqual([
      { text: "Billing\n\nIntro text.", offset: 0, section: null },
      {
        text: "Billing > Refunds\n\nSee [the policy] for details.",
        offset: markdown.indexOf("## Refunds"),
        section: "Refunds",
      },
    ]);
    expect(new Set(chunks.map(({ contentHash }) => contentHash)).size).toBe(2);
  });

  it("splits long sections into overlapping windows and indexes a title-only page", () => {
    const long = `## Notes\n\n${"word ".repeat(1_000)}`;
    const chunks = wikiSemanticChunks("Long", long);

    expect(chunks.length).toBeGreaterThan(2);
    expect(
      chunks.every((chunk) => chunk.text.length <= WIKI_SEMANTIC_CHUNK_MAX_LENGTH + "Long > Notes\n\n".length),
    ).toBe(true);
    expect(chunks.every((chunk) => chunk.offset === 0)).toBe(true);
    expect(wikiSemanticChunks("Empty", "")).toMatchObject([{ text: "Empty", offset: 0, section: null }]);
  });
});
