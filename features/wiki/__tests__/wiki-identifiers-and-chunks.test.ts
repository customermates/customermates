import { describe, expect, it } from "vitest";

import { RETRIEVAL_CHUNK_MAX_LENGTH } from "@/core/retrieval/retrieval-chunks";

import { wikiSemanticChunks } from "../wiki-chunks";
import { wikiCompact, wikiIdentifierPattern, wikiIdentifierTerms } from "../wiki-identifiers";

describe("Wiki identifier terms", () => {
  const identifiers = wikiIdentifierTerms;

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
    expect(chunks.every((chunk) => chunk.text.length <= RETRIEVAL_CHUNK_MAX_LENGTH + "Long > Notes\n\n".length)).toBe(
      true,
    );
    expect(chunks.every((chunk) => chunk.offset === 0)).toBe(true);
    expect(wikiSemanticChunks("Empty", "")).toMatchObject([{ text: "Empty", offset: 0, section: null }]);
  });
});
