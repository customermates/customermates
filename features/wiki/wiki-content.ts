import { editorSchema } from "@/components/editor/editor-extensions";
import { parseMarkdownToJSON } from "@/components/editor/editor.utils";

export const WIKI_EXCERPT_MAX_LENGTH = 200;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export function wikiLeadingSlice(markdown: string, maxBytes: number): string {
  if (utf8Bytes(markdown) <= maxBytes) return markdown;
  let end = 0;
  for (const line of markdown.split("\n")) {
    const next = end + line.length + 1;
    if (utf8Bytes(markdown.slice(0, next)) > maxBytes) break;
    end = next;
  }
  if (end > 0) return markdown.slice(0, end).trimEnd();
  const characters = Array.from(markdown);
  let text = "";
  for (const character of characters) {
    if (utf8Bytes(text + character) > maxBytes) break;
    text += character;
  }
  return text;
}

export function wikiPlainText(markdown: string): string {
  const document = editorSchema.nodeFromJSON(parseMarkdownToJSON(markdown));
  return document.textBetween(0, document.content.size, " ").replaceAll(/\s+/g, " ").trim();
}

export function wikiExcerpt(markdown: string): string {
  const document = editorSchema.nodeFromJSON(parseMarkdownToJSON(markdown));
  let firstParagraph = "";
  document.descendants((node) => {
    if (firstParagraph) return false;
    if (node.type.name === "paragraph" && node.textContent.trim()) {
      firstParagraph = node.textContent;
      return false;
    }
    return true;
  });
  const text = (firstParagraph || document.textBetween(0, document.content.size, " ")).replaceAll(/\s+/g, " ").trim();
  if (text.length <= WIKI_EXCERPT_MAX_LENGTH) return text;
  return `${text
    .slice(0, WIKI_EXCERPT_MAX_LENGTH - 1)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trimEnd()}…`;
}
