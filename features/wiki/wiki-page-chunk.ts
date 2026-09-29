import { wikiMarkdownLinkRanges } from "./wiki-markdown-links";

function startsLowSurrogate(value: string, offset: number): boolean {
  const code = value.charCodeAt(offset);
  return code >= 0xdc00 && code <= 0xdfff;
}

function endsHighSurrogate(value: string, offset: number): boolean {
  const code = value.charCodeAt(offset - 1);
  return code >= 0xd800 && code <= 0xdbff;
}

export function wikiCodePointBoundary(value: string, offset: number): number {
  return offset > 0 && offset < value.length && startsLowSurrogate(value, offset) && endsHighSurrogate(value, offset)
    ? offset - 1
    : offset;
}

function completeWikiLinkBoundary(markdown: string, requestedOffset: number, maximumChars: number, baseUrl: string) {
  const ranges = wikiMarkdownLinkRanges(markdown, baseUrl);
  let offset = wikiCodePointBoundary(markdown, Math.min(requestedOffset, markdown.length));
  const containingStart = ranges.find((range) => offset > range.start && offset < range.end);
  if (containingStart) offset = containingStart.start;

  let end = wikiCodePointBoundary(markdown, Math.min(markdown.length, offset + maximumChars));
  const containingEnd = ranges.find((range) => end > range.start && end < range.end);
  if (containingEnd) end = containingEnd.start > offset ? containingEnd.start : containingEnd.end;
  return { offset, end };
}

export class WikiChunkSizeError extends Error {
  constructor() {
    super("Knowledge Base content cannot fit in one response without splitting a link or Unicode character.");
    this.name = "WikiChunkSizeError";
  }
}

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
  if (!fits(offset, end) || (offset < markdown.length && end <= offset)) throw new WikiChunkSizeError();
  return { offset, end };
}
