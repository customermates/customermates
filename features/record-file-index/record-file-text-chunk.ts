import type { WikiOutlineEntry } from "@/features/wiki/wiki-markdown-sections";

import { wikiOutline } from "@/features/wiki/wiki-markdown-sections";
import { boundedWikiChunk } from "@/features/wiki/wiki-page-chunk";

const OUTLINE_RESERVE = 2_000;

export type RecordFileTextChunk = {
  offset: number;
  nextOffset: number | null;
  totalChars: number;
  outline?: WikiOutlineEntry[];
  outlineTruncated?: true;
  text: string;
};

export function boundedRecordFileText<T>(args: {
  text: string;
  offset: number;
  maxLength: number;
  baseUrl: string;
  outline?: boolean;
  render: (chunk: RecordFileTextChunk) => T;
  measure: (rendered: T) => number;
}): T | null {
  const { text } = args;
  let outlineTruncated = false;
  const output = (offset: number, end: number, outline: WikiOutlineEntry[]) =>
    args.render({
      offset,
      nextOffset: end < text.length ? end : null,
      totalChars: text.length,
      ...(outline.length > 0 ? { outline } : {}),
      ...(outlineTruncated ? { outlineTruncated: true as const } : {}),
      text: text.slice(offset, end),
    });
  const chunk = (outline: WikiOutlineEntry[]) =>
    boundedWikiChunk(
      text,
      args.offset,
      (start, stop) => args.measure(output(start, stop, outline)) <= args.maxLength,
      args.baseUrl,
    );
  const plain = chunk([]);
  if (!plain) return null;
  const headings = args.outline !== false && plain.offset === 0 && plain.end < text.length ? wikiOutline(text) : [];
  const outline: WikiOutlineEntry[] = [];
  for (const heading of headings) {
    if (args.measure(output(plain.offset, plain.offset, [...outline, heading])) > args.maxLength - OUTLINE_RESERVE)
      break;
    outline.push(heading);
  }
  outlineTruncated = outline.length < headings.length;
  const selected = outline.length > 0 || outlineTruncated ? chunk(outline) : plain;
  return selected ? output(selected.offset, selected.end, outline) : null;
}
