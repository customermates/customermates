import { editorSchema } from "@/components/editor/editor-extensions";
import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { wikiCodePointBoundary, wikiMarkdownChunk } from "./wiki-page-chunk";
import { WIKI_RELEVANT_PREVIEW_MAX_CHARS } from "./wiki.schema";

export const WIKI_EXCERPT_MAX_LENGTH = 200;
const WIKI_SUBSTRING_SEARCH_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

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
  return allWikiSearchTerms(query).slice(0, 32);
}

function allWikiSearchTerms(query: string): string[] {
  const segmenter = new Intl.Segmenter("und", { granularity: "word" });
  const expand = (term: string) => {
    const bounded = Array.from(term).slice(0, 64).join("");
    if (!WIKI_SUBSTRING_SEARCH_SCRIPT.test(bounded)) return [bounded];
    const segments = [...segmenter.segment(bounded)]
      .filter(({ isWordLike }) => isWordLike)
      .map(({ segment }) => segment)
      .filter((segment) => segment !== bounded);
    return [bounded, ...segments];
  };
  return [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).flatMap(expand))];
}

export function wikiRelevantSearchTerms(query: string): string[] {
  const terms = allWikiSearchTerms(query);
  const informative = terms.filter((term) => Array.from(term).length > 1);
  const candidates = informative.length > 0 ? informative : terms;
  if (candidates.length <= 32) return candidates;

  const coverage = Array.from(
    { length: 16 },
    (_, index) => candidates[Math.round((index * (candidates.length - 1)) / 15)],
  ).filter((term): term is string => Boolean(term));
  const distinctive = candidates
    .map((term, index) => ({ term, index, length: Array.from(term).length }))
    .sort((left, right) => right.length - left.length || left.index - right.index)
    .map(({ term }) => term);
  return [...new Set([...coverage, ...distinctive])].slice(0, 32);
}

export function wikiSubstringSearchTerms(terms: string[]): string[] {
  return terms.filter((term) => WIKI_SUBSTRING_SEARCH_SCRIPT.test(term));
}

function wikiSearchSnippetForTerms(markdown: string, terms: string[]): string {
  const compact = wikiPlainText(markdown);
  const normalized = compact.toLocaleLowerCase();
  const matches = terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0);
  const match = matches.length > 0 ? Math.min(...matches) : -1;
  const start = wikiCodePointBoundary(compact, match < 0 ? 0 : Math.max(0, match - 80));
  const prefix = start > 0 ? "…" : "";
  const suffix = compact.length - start > WIKI_EXCERPT_MAX_LENGTH - prefix.length ? "…" : "";
  const available = WIKI_EXCERPT_MAX_LENGTH - prefix.length - suffix.length;
  const end = wikiCodePointBoundary(compact, Math.min(compact.length, start + available));
  const snippet = compact.slice(start, end);
  return `${prefix}${snippet}${suffix}`;
}

export function wikiSearchSnippet(markdown: string, query: string): string {
  return wikiSearchSnippetForTerms(markdown, wikiSearchTerms(query));
}

export function wikiRelevantSearchSnippet(markdown: string, query: string): string {
  return wikiSearchSnippetForTerms(markdown, wikiRelevantSearchTerms(query));
}

export function wikiRelevantMarkdownPreview(markdown: string, query: string, baseUrl: string) {
  const normalized = markdown.toLocaleLowerCase();
  const matches = wikiRelevantSearchTerms(query)
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0);
  const match = matches.length > 0 ? Math.min(...matches) : 0;
  const earliest = Math.max(0, match - 300);
  const paragraph = markdown.lastIndexOf("\n\n", match);
  const requestedOffset = paragraph >= earliest ? paragraph + 2 : earliest;
  const chunk = wikiMarkdownChunk(markdown, requestedOffset, WIKI_RELEVANT_PREVIEW_MAX_CHARS, baseUrl);
  return {
    markdownPreview: chunk.markdownChunk,
    previewOffset: chunk.offset,
    previewEnd: chunk.nextOffset ?? chunk.totalChars,
    totalChars: chunk.totalChars,
  };
}
