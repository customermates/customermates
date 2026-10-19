import { describe, expect, it } from "vitest";

import { RETRIEVAL_SECTION_MAX_LENGTH, retrievalSectionParts } from "@/core/retrieval/retrieval-sections";

import { WIKI_SECTION_MAX_EMBEDDED_ROWS, wikiContentHash, wikiSectionRows } from "../wiki-sections";
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

describe("wikiSectionRows", () => {
  it("keeps section text, heading path, anchor and offset, drops link targets, and prefixes the summary for embedding", () => {
    const markdown = "Intro text.\n\n## Refunds\n\nSee [the policy](/wiki?page=abc) for details.";
    const rows = wikiSectionRows({ title: "Billing", markdown }, "Billing rules for customers.");

    expect(
      rows.map(({ text, offset, headingPath, anchor, embeddingText }) => ({
        text,
        offset,
        headingPath,
        anchor,
        embeddingText,
      })),
    ).toEqual([
      {
        text: "Intro text.",
        offset: 0,
        headingPath: [],
        anchor: "",
        embeddingText: "Billing rules for customers.\n\nBilling\n\nIntro text.",
      },
      {
        text: "See [the policy] for details.",
        offset: markdown.indexOf("## Refunds"),
        headingPath: ["Refunds"],
        anchor: "refunds",
        embeddingText: "Billing rules for customers.\n\nBilling > Refunds\n\nSee [the policy] for details.",
      },
    ]);
    expect(new Set(rows.map(({ contentHash }) => contentHash)).size).toBe(2);
    expect(wikiSectionRows({ title: "Billing", markdown }, null)[0].contentHash).not.toBe(rows[0].contentHash);
  });

  it("keeps every section of a long page for keyword search, beyond the rows that get embedded", () => {
    const entries = Array.from({ length: 300 }, (_, index) => `## Term ${index}\n\nGlossary entry ${index}.`);
    const rows = wikiSectionRows({ title: "Glossary", markdown: entries.join("\n\n") }, null);

    expect(WIKI_SECTION_MAX_EMBEDDED_ROWS).toBe(256);
    expect(rows).toHaveLength(300);
    expect(rows.map(({ ordinal }) => ordinal)).toEqual(Array.from({ length: 300 }, (_, index) => index));
    expect(rows.at(-1)).toMatchObject({ headingPath: ["Term 299"], text: "Glossary entry 299." });
  });

  it("splits long sections deterministically on paragraph boundaries and indexes a title-only page", () => {
    const paragraphs = Array.from({ length: 8 }, (_, index) => `Paragraph ${index}. ${"word ".repeat(80).trim()}`);
    const long = `## Notes\n\n${paragraphs.join("\n\n")}`;
    const rows = wikiSectionRows({ title: "Long", markdown: long }, null);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.text.length <= RETRIEVAL_SECTION_MAX_LENGTH)).toBe(true);
    expect(rows.every((row) => row.offset === 0 && row.anchor === "notes")).toBe(true);
    expect(rows.map((row) => row.text).join("\n\n")).toBe(paragraphs.join("\n\n"));
    expect(wikiSectionRows({ title: "Long", markdown: long }, null)).toEqual(rows);
    expect(wikiSectionRows({ title: "Empty", markdown: "" }, null)).toMatchObject([
      { text: "", offset: 0, headingPath: [], embeddingText: "Empty" },
    ]);
  });

  it("hard-splits a single oversized paragraph and keeps fenced code blocks together", () => {
    const fenced = "```\nline one\n\nline two\n```";
    expect(retrievalSectionParts(`${"a".repeat(1_000)}\n\n${fenced}`)).toEqual([`${"a".repeat(1_000)}\n\n${fenced}`]);
    const parts = retrievalSectionParts("word ".repeat(1_000));
    expect(parts.length).toBe(3);
    expect(parts.every((part) => part.length <= RETRIEVAL_SECTION_MAX_LENGTH)).toBe(true);
  });

  it("hashes the title and Markdown that the summary describes", () => {
    expect(wikiContentHash({ title: "A", markdown: "b" })).toBe(wikiContentHash({ title: "A", markdown: "b" }));
    expect(wikiContentHash({ title: "A", markdown: "b" })).not.toBe(wikiContentHash({ title: "A", markdown: "c" }));
  });
});
