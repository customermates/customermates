import { decode, encode } from "@toon-format/toon";
import { z } from "zod";

const SOURCE_TEXT_MARKER = "\n\nStored website source text:\n";
const SourceChunkSchema = z.looseObject({
  id: z.uuid(),
  offset: z.number().int().nonnegative(),
  text: z.string(),
});
const SourceChunksSchema = z.looseObject({
  items: z.array(SourceChunkSchema).min(1),
});
const SourceMetadataSchema = z.looseObject({
  items: z
    .array(
      z.looseObject({
        id: z.uuid(),
        offset: z.number().int().nonnegative(),
        bodyCharacters: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

function sourceHeader(id: string, offset: number): string {
  return `\nSource ${id} at offset ${offset}\n`;
}

function sourceFooter(id: string): string {
  return `\nEnd source ${id}\n`;
}

export function wikiSourceResultText(payload: unknown): string {
  const chunks = SourceChunksSchema.safeParse(payload);
  if (!chunks.success) return encode(payload);
  const metadata = {
    ...chunks.data,
    items: chunks.data.items.map(({ text, ...item }) => ({
      ...item,
      bodyCharacters: text.length,
    })),
  };
  return (
    encode(metadata) +
    SOURCE_TEXT_MARKER +
    chunks.data.items.map(({ id, offset, text }) => sourceHeader(id, offset) + text + sourceFooter(id)).join("")
  );
}

export function decodeWikiSourceResult(result: string): unknown {
  const start = result.indexOf(SOURCE_TEXT_MARKER);
  if (start < 0) return decode(result);
  const metadata = SourceMetadataSchema.safeParse(decode(result.slice(0, start)));
  if (!metadata.success) return null;
  let cursor = start + SOURCE_TEXT_MARKER.length;
  const items: Array<Record<string, unknown>> = [];
  for (const { bodyCharacters, ...item } of metadata.data.items) {
    if ("text" in item) return null;
    const header = sourceHeader(item.id, item.offset);
    if (!result.startsWith(header, cursor)) return null;
    cursor += header.length;
    const text = result.slice(cursor, cursor + bodyCharacters);
    if (text.length !== bodyCharacters) return null;
    cursor += bodyCharacters;
    const footer = sourceFooter(item.id);
    if (!result.startsWith(footer, cursor)) return null;
    cursor += footer.length;
    items.push({ ...item, text });
  }
  return cursor === result.length ? { ...metadata.data, items } : null;
}
