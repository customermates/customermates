import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WikiCrawlTargetProgressSchema } from "@/features/wiki/wiki-crawl-progress.schema";
import { WikiCrawlCategorySchema } from "./website-discovery";

const StoredWikiCrawlTargetSchema = WikiCrawlTargetProgressSchema.extend({
  category: WikiCrawlCategorySchema,
}).strict();
export type StoredWikiCrawlTarget = Data<typeof StoredWikiCrawlTargetSchema>;
const StoredWikiCrawlTargetsSchema = z
  .array(StoredWikiCrawlTargetSchema)
  .refine((targets) => new Set(targets.map(({ url }) => url)).size === targets.length)
  .nullable();

export function parseStoredWikiCrawlTargets(value: unknown): StoredWikiCrawlTarget[] | null {
  const parsed = StoredWikiCrawlTargetsSchema.safeParse(value);
  if (!parsed.success) throw new Error("Knowledge Base crawl progress is invalid.", { cause: parsed.error });

  return parsed.data;
}
