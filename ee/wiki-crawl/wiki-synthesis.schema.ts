import { z } from "zod";

import { WIKI_SYNTHESIS_SKIP_REASONS, WIKI_SYNTHESIS_TOPIC_STATUSES } from "@/features/wiki/wiki-crawl-progress.schema";
import { WIKI_TITLE_MAX_LENGTH } from "@/features/wiki/wiki.schema";

export const WIKI_SYNTHESIS_MAX_PAGES = 16;
export const WIKI_SYNTHESIS_MAX_TOPIC_SOURCES = 6;

export const WIKI_SYNTHESIS_FOUNDATION_ROLES = [
  "company_overview",
  "customers_and_use_cases",
  "sales_messaging",
  "voice_and_tone",
] as const;
export const WIKI_SYNTHESIS_ROLES = [
  ...WIKI_SYNTHESIS_FOUNDATION_ROLES,
  "offering",
  "procedure",
  "operating_guide",
] as const;
export type WikiSynthesisRole = (typeof WIKI_SYNTHESIS_ROLES)[number];

export const WikiSynthesisPlanSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().describe("Page title in the Knowledge Base language."),
        role: z.enum(WIKI_SYNTHESIS_ROLES),
        sources: z.array(z.string()).describe("Source keys from the inventory, for example s3."),
      }),
    )
    .describe("Every page to write, foundations first, the Operating Guide last."),
});

export const WikiSynthesisDraftSchema = z.object({
  whenToUse: z.string().describe("Procedures only: the situation in the customer's words. Otherwise empty."),
  sections: z.array(
    z.object({
      heading: z.string(),
      evidence: z
        .array(z.object({ source: z.string(), quote: z.string() }))
        .describe("Exact passages copied from the cited source text that support every claim in this section."),
      content: z.string().describe("Markdown paraphrase of only what the evidence supports."),
    }),
  ),
  gaps: z.array(z.string()).describe("Neutral questions for facts the sources do not establish."),
});
export type WikiSynthesisDraft = z.infer<typeof WikiSynthesisDraftSchema>;

const StoredWikiSynthesisTopicSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
  role: z.enum(WIKI_SYNTHESIS_ROLES),
  sourceIds: z.array(z.uuid()).max(WIKI_SYNTHESIS_MAX_TOPIC_SOURCES),
  status: z.enum(WIKI_SYNTHESIS_TOPIC_STATUSES),
  pageId: z.uuid().optional(),
  skipReason: z.enum(WIKI_SYNTHESIS_SKIP_REASONS).optional(),
});
export type StoredWikiSynthesisTopic = z.infer<typeof StoredWikiSynthesisTopicSchema>;

const StoredWikiSynthesisTopicsSchema = z.array(StoredWikiSynthesisTopicSchema).max(WIKI_SYNTHESIS_MAX_PAGES);

export function parseStoredWikiSynthesisTopics(value: unknown): StoredWikiSynthesisTopic[] | null {
  if (value === null || value === undefined) return null;
  return StoredWikiSynthesisTopicsSchema.parse(value);
}
