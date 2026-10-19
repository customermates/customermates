export const RETRIEVAL_SECTION_MAX_LENGTH = 1_800;

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/u;

function codePointBoundary(value: string, offset: number): number {
  if (offset <= 0 || offset >= value.length) return offset;
  const low = value.charCodeAt(offset);
  const high = value.charCodeAt(offset - 1);
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? offset - 1 : offset;
}

function paragraphs(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const marker = FENCE_LINE.exec(line)?.[1];
    if (marker && fence === null) fence = marker[0];
    else if (marker && marker[0] === fence) fence = null;
    if (fence === null && !marker && line.trim() === "") {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

function hardSplit(text: string, maxLength: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength + 1);
    const newline = window.lastIndexOf("\n");
    const space = window.lastIndexOf(" ");
    const preferred = newline > maxLength / 2 ? newline : space > maxLength / 2 ? space : -1;
    const end = preferred > 0 ? preferred : codePointBoundary(rest, maxLength);
    pieces.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export function retrievalSectionParts(text: string, maxLength = RETRIEVAL_SECTION_MAX_LENGTH): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return [trimmed];
  const parts: string[] = [];
  let current = "";
  for (const block of paragraphs(trimmed).flatMap((paragraph) => hardSplit(paragraph, maxLength))) {
    if (current && current.length + 2 + block.length > maxLength) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) parts.push(current);
  return parts;
}

export function retrievalSectionLabel(pageTitle: string, headingPath: readonly string[]): string {
  const heading = headingPath.join(" > ");
  return heading && heading !== pageTitle ? `${pageTitle} > ${heading}` : pageTitle;
}

export function retrievalEmbeddingText(label: string, body: string, prefix: string | null = null): string {
  return [prefix, label, body].filter(Boolean).join("\n\n");
}
