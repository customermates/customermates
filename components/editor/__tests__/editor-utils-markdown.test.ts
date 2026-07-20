import { describe, it, expect } from "vitest";

import { parseMarkdownToJSON, serializeJSONToMarkdown } from "../editor.utils";

const roundTrip = (markdown: string) => serializeJSONToMarkdown(parseMarkdownToJSON(markdown));

describe("editor markdown round-trip", () => {
  it("round-trips an image", () => {
    const md = "Before ![alt text](https://example.com/x.png) after";

    expect(roundTrip(md)).toBe(md);
  });

  it("round-trips a GFM table, preserving inline marks in cells", () => {
    const md = "| Name | Role |\n| --- | --- |\n| Ada | **CTO** |\n| Bo | Eng |";

    expect(roundTrip(md)).toBe(md);
  });

  it("round-trips an image inside a table cell", () => {
    const md = "| Pic | Note |\n| --- | --- |\n| ![a](http://x/y.png) | hi |";

    expect(roundTrip(md)).toBe(md);
  });

  it("still round-trips supported non-table markdown", () => {
    const md = "# Hello\n\n**bold** and *italic*";

    expect(roundTrip(md)).toBe(md);
  });

  it("flattens rich (block) cell content into a single GFM row without throwing", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Items" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "one" }],
                            },
                          ],
                        },
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "two" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const out = serializeJSONToMarkdown(doc);

    expect(out).toContain("| Items |");
    expect(out).not.toContain("\n- ");
    expect(out).toContain("one");
    expect(out).toContain("two");
  });

  it("keeps a table inside a blockquote, so an MCP append does not destroy it", () => {
    const md = "> | a | b |\n> | --- | --- |\n> | c | d |";

    expect(roundTrip(md)).toBe(md);
    expect(JSON.stringify(parseMarkdownToJSON(roundTrip(md)))).toContain('"table"');
  });

  it("keeps a table inside a list item, so an MCP append does not destroy it", () => {
    const md = "- item\n\n  | a | b |\n  | --- | --- |\n  | c | d |";

    expect(roundTrip(md)).toBe(md);
    expect(JSON.stringify(parseMarkdownToJSON(roundTrip(md)))).toContain('"table"');
  });

  it("does not compound alt-text escapes across repeated saves", () => {
    const md = "![a \\[b\\] c](https://example.com/x.png)";
    const once = roundTrip(md);

    expect(roundTrip(once)).toBe(once);
  });

  it("separates multiple blocks in one cell instead of gluing the words together", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "H" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "alpha" }],
                    },
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "beta" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(serializeJSONToMarkdown(doc)).toContain("alpha beta");
    expect(serializeJSONToMarkdown(doc)).not.toContain("alphabeta");
  });

  it("does not promote a headerless table's first data row into a header", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "keep" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const reparsed = JSON.stringify(parseMarkdownToJSON(serializeJSONToMarkdown(doc)));

    expect(reparsed).toContain("keep");
    expect(reparsed).not.toContain(
      '"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"keep"',
    );
  });

  it("keeps an image whose src contains a space instead of degrading it to text", () => {
    const md = "![a](<https://example.com/two words.png>)";
    const reparsed = JSON.stringify(parseMarkdownToJSON(roundTrip(md)));

    expect(reparsed).toContain('"type":"image"');
    expect(reparsed).toContain("two%20words.png");
  });
});
