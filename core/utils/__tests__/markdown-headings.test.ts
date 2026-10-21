import { describe, expect, it } from "vitest";

import { stripMarkdownHeadingIds } from "../markdown-headings";

describe("source Markdown heading anchors", () => {
  it("removes site anchor metadata without changing visible headings or inline content", () => {
    expect(
      stripMarkdownHeadingIds(
        "## Pick your client and start [#pick-your-client-and-start]\n\n### Overview {#overview}\n\n## Existing \\[#existing\\]\n\nParagraph {#keep} and [link](#overview).\n\n## C# and [linked title](#overview)",
      ),
    ).toBe(
      "## Pick your client and start\n\n### Overview\n\n## Existing\n\nParagraph {#keep} and [link](#overview).\n\n## C# and [linked title](#overview)",
    );
  });

  it("preserves literal Markdown examples in fenced code, including nested shorter fences", () => {
    const example = "````md\n## Example {#keep}\n```\n## Still example [#keep]\n````\n\n## Actual [#remove]";
    expect(stripMarkdownHeadingIds(example)).toBe(example.replace("## Actual [#remove]", "## Actual"));
    expect(stripMarkdownHeadingIds("~~~md\n# Example {#keep}\n~~~\n## Actual {#remove}")).toBe(
      "~~~md\n# Example {#keep}\n~~~\n## Actual",
    );
  });
});
