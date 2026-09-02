import { describe, it, expect } from "vitest";

import { hasMarkdownBlockStructure, parseMarkdownToJSON, serializeJSONToMarkdown } from "../editor.utils";

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

  it.each(["a|b", "a\\b", "a\\|b", "back\\slash and | pipe"])("round-trips cell text %j", (text) => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }],
            },
          ],
        },
      ],
    };

    const back = JSON.parse(JSON.stringify(parseMarkdownToJSON(serializeJSONToMarkdown(doc))));

    expect(back.content[0].content[1].content[0].content[0].content[0].text).toBe(text);
  });

  it("escapes a backslash in an image src so it cannot terminate the destination early", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "image", attrs: { src: "https://example.com/a\\)b.png", alt: "x", title: null } }],
        },
      ],
    };

    const reparsed = JSON.parse(JSON.stringify(parseMarkdownToJSON(serializeJSONToMarkdown(doc))));

    expect(reparsed.content[0].content[0].type).toBe("image");
    expect(reparsed.content[0].content[0].attrs.src).toContain(")b.png");
  });

  it("keeps an image whose src contains a space instead of degrading it to text", () => {
    const md = "![a](<https://example.com/two words.png>)";
    const reparsed = JSON.stringify(parseMarkdownToJSON(roundTrip(md)));

    expect(reparsed).toContain('"type":"image"');
    expect(reparsed).toContain("two%20words.png");
  });
});

describe("hasMarkdownBlockStructure", () => {
  it.each([
    ["a table", "| a | b |\n| --- | --- |\n| c | d |"],
    ["an image", "![alt](https://example.com/a.png)"],
    ["a heading", "# Title"],
    ["a bullet list", "- one\n- two"],
    ["a task list", "- [ ] one"],
    ["a code block", "```js\nconst a = 1;\n```"],
    ["a blockquote", "> quoted"],
    ["a horizontal rule", "---"],
  ])("reports %s as markdown worth preferring over pasted html", (_label, markdown) => {
    expect(hasMarkdownBlockStructure(parseMarkdownToJSON(markdown))).toBe(true);
  });

  it.each([
    ["plain prose", "just some notes about the account"],
    ["inline marks only", "**bold** and *italic* text"],
    ["a bare link", "see https://example.com/article for details"],
  ])("reports %s as ordinary text so pasted html still wins", (_label, markdown) => {
    expect(hasMarkdownBlockStructure(parseMarkdownToJSON(markdown))).toBe(false);
  });
});

const TASK_LIST_DOC = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Follow-ups:" }] },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Send the quote" }] }],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Book the demo" }] }],
        },
      ],
    },
  ],
};

const flatten = (node: { text?: string; content?: unknown[] }): string =>
  (node.text ?? "") + ((node.content as Array<{ text?: string; content?: unknown[] }>) ?? []).map(flatten).join(" ");

const topLevelTypes = (markdown: string) =>
  (parseMarkdownToJSON(markdown) as { content: Array<{ type: string }> }).content.map((node) => node.type);

describe("task list markdown", () => {
  it("writes the list marker GFM needs", () => {
    const markdown = serializeJSONToMarkdown(TASK_LIST_DOC);

    expect(markdown).toContain("- [x] Send the quote");
    expect(markdown).toContain("- [ ] Book the demo");
  });

  it("round-trips a task list back to the identical document", () => {
    const back = parseMarkdownToJSON(serializeJSONToMarkdown(TASK_LIST_DOC));

    expect(back).toEqual(TASK_LIST_DOC);
  });

  it("stays stable over a second cycle rather than escaping its own checkboxes", () => {
    const once = serializeJSONToMarkdown(TASK_LIST_DOC);

    expect(roundTrip(once)).toBe(once);
  });

  it("keeps every word when one list mixes a bullet with a checkbox", () => {
    const doc = parseMarkdownToJSON("- bullet\n- [x] task") as { content: Array<{ type: string }> };

    expect(flatten(doc)).toBe("bullet task");
    expect(doc.content.map((node) => node.type)).toEqual(["bulletList"]);
  });

  it("keeps every word when a checkbox appears in an ordered list", () => {
    const doc = parseMarkdownToJSON("1. [x] one\n2. two") as { content: Array<{ type: string }> };

    expect(flatten(doc)).toBe("one two");
    expect(doc.content.map((node) => node.type)).toEqual(["orderedList"]);
  });

  it("keeps both levels when a task list is nested under a task item", () => {
    const doc = parseMarkdownToJSON("- [ ] parent\n  - [x] child");

    expect(flatten(doc as never)).toBe("parent child");
  });

  it("leaves an ordinary bullet list untouched", () => {
    expect(topLevelTypes("- one\n- two")).toEqual(["bulletList"]);
    expect(flatten(parseMarkdownToJSON("- one\n- two") as never)).toBe("one two");
  });

  it("leaves a checkbox item alone when it holds a block a task item cannot contain", () => {
    for (const markdown of [
      "- [x] one\n\n  ```\n  code\n  ```",
      "- [x] one\n\n  ## heading",
      "- [x] one\n\n  > quoted",
    ]) {
      const doc = parseMarkdownToJSON(markdown) as { content: Array<{ type: string }> };

      expect(doc.content.map((node) => node.type)).toEqual(["bulletList"]);
      expect(flatten(doc)).toContain("one");
    }
  });

  it("converts a task item that holds more than one paragraph", () => {
    const doc = parseMarkdownToJSON("- [x] one\n\n  more text") as { content: Array<{ type: string }> };

    expect(doc.content.map((node) => node.type)).toEqual(["taskList"]);
    expect(flatten(doc)).toBe("one more text");
  });
});
