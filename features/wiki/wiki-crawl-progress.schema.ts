import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { parsePublicPageUrl } from "./wiki-homepage";

export const WIKI_CRAWL_TARGET_STATUSES = ["pending", "reading", "read", "failed"] as const;
export const WikiCrawlTargetStatusSchema = z.enum(WIKI_CRAWL_TARGET_STATUSES);
export type WikiCrawlTargetStatus = Data<typeof WikiCrawlTargetStatusSchema>;
export const WikiCrawlTargetProgressSchema = z.object({
  url: z
    .string()
    .url()
    .max(2_000)
    .refine((url) => parsePublicPageUrl(url) !== null),
  status: WikiCrawlTargetStatusSchema,
});
export type WikiCrawlTargetProgress = Data<typeof WikiCrawlTargetProgressSchema>;

export const WIKI_SYNTHESIS_SKIP_REASONS = [
  "generation",
  "evidence",
  "review",
  "reviewUnavailable",
  "credits",
  "persistence",
  "error",
] as const;
export const WIKI_SYNTHESIS_TOPIC_STATUSES = ["pending", "writing", "created", "skipped"] as const;
export const WikiSynthesisTopicProgressSchema = z.object({
  title: z.string().min(1).max(200),
  status: z.enum(WIKI_SYNTHESIS_TOPIC_STATUSES),
  skipReason: z.enum(WIKI_SYNTHESIS_SKIP_REASONS).optional(),
});
export type WikiSynthesisTopicProgress = Data<typeof WikiSynthesisTopicProgressSchema>;
export type WikiSynthesisSkipReason = (typeof WIKI_SYNTHESIS_SKIP_REASONS)[number];
