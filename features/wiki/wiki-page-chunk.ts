export const WIKI_AGENTS_CONTEXT_MAX_CHARS = 4_000;

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

export function wikiMarkdownChunk(markdown: string, requestedOffset: number, maximumChars: number) {
  const offset = wikiCodePointBoundary(markdown, Math.min(requestedOffset, markdown.length));
  const end = wikiCodePointBoundary(markdown, Math.min(markdown.length, offset + maximumChars));
  return {
    markdownChunk: markdown.slice(offset, end),
    offset,
    nextOffset: end < markdown.length ? end : null,
    totalChars: markdown.length,
  };
}
