import { editorSchema } from "@/components/editor/editor-extensions";
import { parseMarkdownToJSON } from "@/components/editor/editor.utils";

export const WIKI_EXCERPT_MAX_LENGTH = 200;

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

export function wikiSearchTerms(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 32);
}
