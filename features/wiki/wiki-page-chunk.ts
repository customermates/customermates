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

export function wikiMarkdownChunk(
  markdown: string,
  requestedOffset: number,
  maximumChars: number,
  baseUrl = "https://wiki.invalid",
) {
  const { offset, end } = completeWikiLinkBoundary(markdown, requestedOffset, maximumChars, baseUrl);
  return {
    markdownChunk: markdown.slice(offset, end),
    offset,
    nextOffset: end < markdown.length ? end : null,
    totalChars: markdown.length,
  };
}
