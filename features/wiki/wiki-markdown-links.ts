import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";

import { parseWikiPageHref, wikiPageFetchId, wikiPagePath, wikiPageUrl } from "./wiki-links";

const MARKDOWN_LINK_PATTERN = /\[((?:\\.|[^\]\\\r\n])*)\]\(\s*(<?)([^)>\s]+)(>?)(?:\s+["'][^\r\n]*?["'])?\s*\)/giu;
const WIKI_LINK_LABEL_MAX_LENGTH = 120;
const WIKI_LINK_ATOMIC_MAX_LENGTH = 512;

type MarkdownNode = {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: MarkdownNode[];
};

export type WikiPageLink = {
  id: string;
  label: string;
  path: string;
  url: string;
  fetchId: string;
};

function visit(node: MarkdownNode, callback: (node: MarkdownNode) => void) {
  callback(node);
  for (const child of node.content ?? []) visit(child, callback);
}

function boundedLinkLabel(value: string | undefined): string {
  const label = value?.trim() || "Wiki page";
  if (label.length <= WIKI_LINK_LABEL_MAX_LENGTH) return label;
  return `${label
    .slice(0, WIKI_LINK_LABEL_MAX_LENGTH - 1)
    .replace(/[\uD800-\uDBFF]$/u, "")
    .trimEnd()}…`;
}

export function extractWikiPageLinks(markdown: string, baseUrl: string, limit = 25): WikiPageLink[] {
  const document = parseMarkdownToJSON(markdown) as MarkdownNode;
  const links: WikiPageLink[] = [];
  const seen = new Set<string>();
  visit(document, (node) => {
    if (links.length >= limit) return;
    const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    const target = typeof href === "string" ? parseWikiPageHref(href, baseUrl) : null;
    if (!target || seen.has(target.id)) return;
    seen.add(target.id);
    links.push({
      id: target.id,
      label: boundedLinkLabel(node.text),
      path: wikiPagePath(target.id),
      url: wikiPageUrl(baseUrl, target.id),
      fetchId: wikiPageFetchId(target.id),
    });
  });
  return links;
}

export function externalizeWikiPageLinks(markdown: string, baseUrl: string): string {
  const document = parseMarkdownToJSON(markdown) as MarkdownNode;
  visit(document, (node) => {
    for (const mark of node.marks ?? []) {
      const href = mark.type === "link" ? mark.attrs?.href : null;
      const target = typeof href === "string" ? parseWikiPageHref(href, baseUrl) : null;
      if (target && mark.attrs) mark.attrs.href = wikiPageUrl(baseUrl, target.id);
    }
  });
  return serializeJSONToMarkdown(document);
}

export function wikiMarkdownLinkRanges(markdown: string, baseUrl: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    if (match.index === undefined || !match[3] || !parseWikiPageHref(match[3], baseUrl)) continue;
    if (match[0].length <= WIKI_LINK_ATOMIC_MAX_LENGTH) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      continue;
    }

    const hrefStart = match[0].indexOf(match[3]);
    const destinationStart = match[0].lastIndexOf("](", hrefStart);
    const suffixLength = match[0].length - hrefStart - match[3].length;
    ranges.push({
      start: match.index + (destinationStart >= 0 ? destinationStart : hrefStart),
      end: match.index + (suffixLength <= WIKI_LINK_ATOMIC_MAX_LENGTH ? match[0].length : hrefStart + match[3].length),
    });
  }
  return ranges;
}
