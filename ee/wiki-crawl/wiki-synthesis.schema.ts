import { z } from "zod";

import { WIKI_SYNTHESIS_SKIP_REASONS, WIKI_SYNTHESIS_TOPIC_STATUSES } from "@/features/wiki/wiki-crawl-progress.schema";
import { WIKI_TITLE_MAX_LENGTH } from "@/features/wiki/wiki.schema";

export const WIKI_SYNTHESIS_MAX_PAGES = 16;
export const WIKI_SYNTHESIS_MAX_STORED_TOPICS = 28;
export const WIKI_SYNTHESIS_MAX_OUTLINE = 12;
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
  "faq",
  "competitor",
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

export const WikiSynthesisBriefPlanSchema = z.object({
  topics: z
    .array(
      z.object({
        key: z.string().describe("The key of the required page this topic covers, or an empty string."),
        title: z.string().describe("Page title in the Knowledge Base language."),
        role: z.enum(WIKI_SYNTHESIS_ROLES),
        sources: z.array(z.string()).describe("Source keys from the inventory, for example s3."),
      }),
    )
    .describe("Every required page first, then additional pages, the Operating Guide last."),
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
  claimedAt: z.iso.datetime().optional(),
  setupKey: z.string().min(1).max(40).optional(),
  outline: z.array(z.string().trim().min(1).max(200)).max(WIKI_SYNTHESIS_MAX_OUTLINE).optional(),
  competitor: z.string().trim().min(1).max(80).optional(),
  addressForm: z.enum(["formal", "informal"]).optional(),
});
export type StoredWikiSynthesisTopic = z.infer<typeof StoredWikiSynthesisTopicSchema>;

const StoredWikiSynthesisTopicsSchema = z.array(StoredWikiSynthesisTopicSchema).max(WIKI_SYNTHESIS_MAX_STORED_TOPICS);

export function parseStoredWikiSynthesisTopics(value: unknown): StoredWikiSynthesisTopic[] | null {
  if (value === null || value === undefined) return null;
  return StoredWikiSynthesisTopicsSchema.parse(value);
}
