import { describe, expect, it } from "vitest";

import {
  wikiAnchoredSections,
  wikiMarkdownSections,
  wikiOutline,
  wikiSectionAnchorAt,
  wikiSectionOffsetIn,
} from "../wiki-markdown-sections";

const handbook = [
  "Intro paragraph about the handbook.",
  "## Refunds",
  "Refunds are paid within 5 days.",
  "### Approval",
  "Refunds above 500 EUR require approval from the finance lead.",
  "```",
  "# not a heading",
  "```",
  "## Travel",
  "The per diem for Berlin is 28 EUR.",
].join("\n");

describe("wikiMarkdownSections and wikiOutline", () => {
  it("splits canonical Markdown into heading-path sections with exact offsets, ignoring fenced code", () => {
    const sections = wikiMarkdownSections(handbook);
    expect(sections.map((section) => section.path)).toEqual([[], ["Refunds"], ["Refunds", "Approval"], ["Travel"]]);
    for (const section of sections.slice(1))
      expect(handbook.slice(section.offset)).toMatch(new RegExp(`^#+ ${section.path.at(-1)}`));
    expect(sections.at(-1)?.end).toBe(handbook.length);
    expect(wikiOutline(handbook)).toEqual([
      { level: 2, heading: "Refunds", offset: handbook.indexOf("## Refunds") },
      { level: 3, heading: "Approval", offset: handbook.indexOf("### Approval") },
      { level: 2, heading: "Travel", offset: handbook.indexOf("## Travel") },
    ]);
  });

  it("names every section by an anchor of its own, numbering a repeated heading", () => {
    const page = [
      "Intro.",
      "## Inbox",
      "### Limits",
      "Twenty.",
      "## Signals",
      "### Limits",
      "Five.",
      "## Limits 2",
      "None.",
      "### Limits",
      "Again.",
      "## ???",
      "No words.",
    ].join("\n");
    const sections = wikiAnchoredSections(page);

    expect(sections.map((section) => section.anchor)).toEqual([
      "inbox",
      "limits",
      "signals",
      "limits-3",
      "limits-2",
      "limits-4",
      "",
    ]);
    expect(new Set(sections.map((section) => section.anchor)).size).toBe(sections.length);
    expect(wikiAnchoredSections(handbook).map((section) => section.anchor)).toEqual(["refunds", "approval", "travel"]);
  });

  it("finds the anchor of the section that starts at an offset", () => {
    const page = "Intro.\n## Limits\nOne.\n## Limits\nTwo.";

    expect(wikiSectionAnchorAt(page, page.indexOf("## Limits"))).toBe("limits");
    expect(wikiSectionAnchorAt(page, page.lastIndexOf("## Limits"))).toBe("limits-2");
    expect(wikiSectionAnchorAt(page, 0)).toBeNull();
    expect(wikiSectionAnchorAt(page, 3)).toBeNull();
  });

  it("maps a section offset between stored and link-externalized Markdown", () => {
    const stored = "Intro [Other](/wiki?page=1).\n\n## Answer\n\nText";
    const externalized = "Intro [Other](https://example.com/wiki?page=1).\n\n## Answer\n\nText";
    expect(wikiSectionOffsetIn(stored, stored.indexOf("## Answer"), externalized)).toBe(
      externalized.indexOf("## Answer"),
    );
    expect(wikiSectionOffsetIn(stored, 0, externalized)).toBe(0);
  });
});
