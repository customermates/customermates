import { describe, expect, it } from "vitest";

import { parseMarkdownToJSON } from "@/components/editor/editor.utils";

import { MAX_RICH_TEXT_JSON_SIZE, validateRichTextDocument } from "../rich-text-document";

describe("validateRichTextDocument", () => {
  it("accepts a canonical editor document with a Heading 3", () => {
    const document = parseMarkdownToJSON("### Implementation details");

    expect(document).toMatchObject({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Implementation details" }] }],
    });
    expect(validateRichTextDocument(JSON.stringify(document))).toEqual(document);
  });

  it("rejects malformed JSON, non-documents and oversized documents", () => {
    expect(validateRichTextDocument("{")).toBeNull();
    expect(validateRichTextDocument("[]")).toBeNull();
    expect(validateRichTextDocument(JSON.stringify({ type: "unknownNode" }))).toBeNull();
    const text = "x".repeat(MAX_RICH_TEXT_JSON_SIZE);
    const oversized = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
    expect(validateRichTextDocument(JSON.stringify(oversized))).toBeNull();
  });
});
