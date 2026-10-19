import { codePointBoundary } from "@/core/retrieval/retrieval-sections";

import { wikiMarkdownLinkRanges } from "./wiki-markdown-links";

function completeWikiLinkBoundary(markdown: string, requestedOffset: number, maximumChars: number, baseUrl: string) {
  const ranges = wikiMarkdownLinkRanges(markdown, baseUrl);
  let offset = codePointBoundary(markdown, Math.min(requestedOffset, markdown.length));
  const containingStart = ranges.find((range) => offset > range.start && offset < range.end);
  if (containingStart) offset = containingStart.start;

  let end = codePointBoundary(markdown, Math.min(markdown.length, offset + maximumChars));
  const containingEnd = ranges.find((range) => end > range.start && end < range.end);
  if (containingEnd) end = containingEnd.start > offset ? containingEnd.start : containingEnd.end;
  return { offset, end };
}

export const WIKI_CHUNK_SIZE_FAILURE =
  "Knowledge Base content cannot fit in one response without splitting a link or Unicode character.";

export function boundedWikiChunk(
  markdown: string,
  requestedOffset: number,
  fits: (offset: number, end: number) => boolean,
  baseUrl: string,
) {
  const { offset } = completeWikiLinkBoundary(markdown, requestedOffset, 0, baseUrl);
  let low = offset;
  let high = markdown.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(offset, middle)) low = middle;
    else high = middle - 1;
  }

  const end = completeWikiLinkBoundary(markdown, offset, Math.max(0, low - offset), baseUrl).end;
  if (!fits(offset, end) || (offset < markdown.length && end <= offset)) return null;
  return { offset, end };
}
