import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { baseExtensions } from "../editor-extensions";
import { insertEditorLink } from "../editor-link-picker";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "../editor.utils";

const editors: Editor[] = [];
const link = { href: "/wiki?page=10000000-0000-4000-8000-000000000001", title: "Support process" };
function editor(markdown: string) {
  const instance = new Editor({ extensions: baseExtensions, content: parseMarkdownToJSON(markdown) });
  editors.push(instance);
  return instance;
}
afterEach(() => {
  for (const instance of editors.splice(0)) instance.destroy();
});

describe("Wiki links use the unchanged Notes schema", () => {
  it("inserts a standard Markdown link at an empty cursor", () => {
    const instance = editor("");
    insertEditorLink(instance, link);
    expect(serializeJSONToMarkdown(instance.getJSON())).toBe(`[Support process](${link.href})`);
  });

  it("preserves selected display text when linking a page", () => {
    const instance = editor("Read our policy");
    instance.commands.setTextSelection({ from: 10, to: 16 });
    insertEditorLink(instance, link);
    const markdown = serializeJSONToMarkdown(instance.getJSON());
    expect(markdown).toContain(`[policy](${link.href})`);
    expect(markdown).not.toContain("Support process");
    expect(serializeJSONToMarkdown(parseMarkdownToJSON(markdown))).toBe(markdown);
  });

  it("updates an existing link without inserting duplicate text", () => {
    const instance = editor("[Existing](https://example.com)");
    instance.commands.setTextSelection(4);
    insertEditorLink(instance, link);
    expect(serializeJSONToMarkdown(instance.getJSON())).toBe(`[Existing](${link.href})`);
  });
});
