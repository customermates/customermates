import { decode } from "@toon-format/toon";
import { z } from "zod";

import { WIKI_SOURCE_RESULT_MAX_CHARS } from "@/ee/wiki-crawl/wiki-source-coverage";

import {
  ReadWebsiteSourceSchema,
  ReadWikiWebsiteSourcesResultSchema,
} from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";

const ReadOutcomeSchema = z.object({
  ok: z.literal(true),
  result: z.string().min(1).max(WIKI_SOURCE_RESULT_MAX_CHARS),
});

export function wikiReadSourceEvidence(input: unknown, outcome: unknown): { sourceId: string; result: string } | null {
  const request = ReadWebsiteSourceSchema.safeParse(input);
  const output = ReadOutcomeSchema.safeParse(outcome);
  if (
    !request.success ||
    request.data.action !== "get" ||
    request.data.offset !== 0 ||
    !request.data.id ||
    !output.success
  )
    return null;
  let decoded: unknown;
  try {
    decoded = decode(output.data.result);
  } catch {
    return null;
  }
  const payload = ReadWikiWebsiteSourcesResultSchema.safeParse(decoded);
  if (
    !payload.success ||
    !payload.data.items.some((item) => item.id === request.data.id && item.offset === 0 && Boolean(item.text?.trim()))
  )
    return null;
  return { sourceId: request.data.id, result: output.data.result };
}
