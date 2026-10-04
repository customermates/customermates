import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const WIKI_CRAWL_MODES = ["initial", "refresh", "extend"] as const;
export const WikiCrawlModeSchema = z.enum(WIKI_CRAWL_MODES);
export type WikiWebsiteCrawlMode = Data<typeof WikiCrawlModeSchema>;

export function parseWikiCrawlMode(value: unknown): WikiWebsiteCrawlMode {
  const parsed = WikiCrawlModeSchema.safeParse(value);
  if (!parsed.success) throw new Error("Knowledge Base crawl mode is invalid.", { cause: parsed.error });

  return parsed.data;
}
