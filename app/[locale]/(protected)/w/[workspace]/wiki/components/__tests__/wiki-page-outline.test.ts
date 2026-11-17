import { describe, expect, it } from "vitest";

import { WIKI_HEADING_ID_PREFIX, wikiDocumentHeadings } from "../wiki-page-outline";

const document = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Overview" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Products" }],
    },
    { type: "heading", attrs: { level: 2 }, content: [] },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [
        { type: "text", text: "Support" },
        { type: "text", text: "  process" },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Too deep" }] }],
        },
      ],
    },
  ],
};

describe("Wiki page outline", () => {
  it("derives nonempty H1, H2 and H3 entries in document order without storing metadata", () => {
    expect(wikiDocumentHeadings(document)).toEqual([
      { index: 0, level: 1, text: "Overview" },
      { index: 1, level: 2, text: "Products" },
      { index: 3, level: 3, text: "Support process" },
    ]);
  });

  it("counts an empty heading, so each index still names the heading the editor rendered", () => {
    const [, , support] = wikiDocumentHeadings(document);
    expect(`${WIKI_HEADING_ID_PREFIX}-${support?.index}`).toBe("wiki-heading-3");
  });

  it("finds no entries in a page without headings", () => {
    expect(wikiDocumentHeadings({ type: "doc", content: [{ type: "paragraph" }] })).toEqual([]);
    expect(wikiDocumentHeadings({})).toEqual([]);
  });
});
