import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH, WikiPageDtoSchema } from "@/features/wiki/wiki.schema";
import { WikiCrawlCategorySchema } from "./website-discovery";

export const WIKI_SYNTHESIS_MAX_PAGES = 16;
export const WIKI_SYNTHESIS_MAX_PAGE_SOURCES = 4;

const SynthesisTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(WIKI_TITLE_MAX_LENGTH)
  .refine((title) => !/[}\]]\s*,\s*[{[]?\s*"?[a-zA-Z]\w*"?\s*:/.test(title), {
    params: { error: CustomErrorCode.wikiImportTitleInvalid },
  });
export const WIKI_SYNTHESIS_FOUNDATION_ROLES = [
  "company_overview",
  "customers_and_use_cases",
  "sales_messaging",
  "voice_and_tone",
] as const;
const FoundationRoleSchema = z.enum(WIKI_SYNTHESIS_FOUNDATION_ROLES);

export const WikiSourceTopicSchema = z
  .object({
    title: SynthesisTitleSchema,
    role: z.enum(["offering", "procedure", ...WIKI_SYNTHESIS_FOUNDATION_ROLES, "operating_guide"]).default("offering"),
    sourceIds: z.array(z.uuid()).min(1).max(40),
  })
  .superRefine((topic, context) => {
    if (
      (topic.role === "offering" || topic.role === "procedure") &&
      topic.sourceIds.length > WIKI_SYNTHESIS_MAX_PAGE_SOURCES
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceIds"],
        params: { error: CustomErrorCode.wikiSourcePlanCitationLimit },
      });
    }
  });
export type WikiSourceTopic = z.infer<typeof WikiSourceTopicSchema>;

const WikiSourceExclusionSchema = z
  .object({
    sourceIds: z.array(z.uuid()).length(1),
    reason: z.string().trim().min(1).max(200),
    basis: z.enum(["already_imported", "exact_duplicate", "overlap", "not_substantive"]),
    duplicateOfSourceId: z.uuid().optional(),
    coveredByTitle: SynthesisTitleSchema.optional(),
    coveredByRole: z.literal("offering").optional(),
    evidenceQuote: z.string().trim().min(1).max(500).optional(),
    counterpartSourceId: z.uuid().optional(),
    counterpartQuote: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    const hasDuplicate = value.duplicateOfSourceId !== undefined;
    const hasCoverage = value.coveredByTitle !== undefined || value.coveredByRole !== undefined;
    const hasEvidence = value.evidenceQuote !== undefined;
    const hasCounterpart = value.counterpartSourceId !== undefined || value.counterpartQuote !== undefined;
    const valid =
      value.basis === "already_imported"
        ? !hasDuplicate && !hasCoverage && !hasEvidence && !hasCounterpart
        : value.basis === "exact_duplicate"
          ? hasDuplicate && !hasCoverage && !hasEvidence && !hasCounterpart
          : value.basis === "overlap"
            ? value.coveredByTitle !== undefined &&
              value.coveredByRole !== undefined &&
              hasEvidence &&
              value.counterpartSourceId !== undefined &&
              value.counterpartQuote !== undefined &&
              !hasDuplicate
            : hasEvidence && !hasDuplicate && !hasCoverage && !hasCounterpart;
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["basis"],
        params: { error: CustomErrorCode.wikiSourceCitationInvalid },
      });
    }
  });

export const ReadWebsiteSourceSchema = z.object({
  action: z
    .enum(["list", "get", "next", "plan"])
    .describe(
      "list = source inventory; next = unread chunks; get = reread after full coverage; plan = account for every source with topic groups or reasoned exclusions before creating pages.",
    ),
  id: z.uuid().optional().describe("Source id from list."),
  offset: z.coerce.number().int().min(0).optional().describe("Prior nextOffset; get must not skip unread text."),
  topics: z
    .array(WikiSourceTopicSchema)
    .max(WIKI_SYNTHESIS_MAX_PAGES)
    .optional()
    .describe(
      "plan only: exact titles, roles and supporting sources for offerings, four foundations, supported procedures and the Operating Guide. Combine translations; the same source can support several distinct topics. Offering and procedure pages must cite every planned sourceId; aggregate foundations and the guide may cite other fully read sources in the same crawl. Each offering or procedure plans one to four supporting sources, and its create must cite every planned source. Retain distinctive customer cases, architecture, steps and limitations in those sources and in the authored page; if four sources cannot cover them faithfully, split the topic before accepting the plan.",
    ),
  excluded: z
    .array(WikiSourceExclusionSchema)
    .max(40)
    .optional()
    .describe(
      "plan only: one source per exclusion with a reason and basis. already_imported requires an unchanged imported source. exact_duplicate names duplicateOfSourceId with identical stored content, retained in a topic or already imported. overlap names the exact coveredByTitle of a retained offering and coveredByRole=offering; foundations cannot replace offerings. A shared service family or technology label alone does not justify overlap. If an article adds a distinctive customer case, architecture, steps or limiting conditions, retain its source in the offering topic instead of excluding it, and cover that substance when creating the page. Retain a separate topic if the four-source budget prevents faithful coverage. Use overlap only for redundant content fully represented by the retained offering's cited sources; a source belongs in topics or exclusions, never both. not_substantive requires an exact evidenceQuote from that source. For exclusion and repair evidence, copy a single contiguous sentence or line directly from the returned text. Preserve spelling, punctuation and whitespace exactly; do not insert literal backslash-n characters, ellipses, translated wording or Markdown headings from the inventory. Reread with get and offset=0 when the exact text is no longer visible. For a rejected plan, repair one affected source or a small group and immediately resubmit the full retained draft, even if other reported issues remain. Keep corrected entries in every resubmission. The plan remains rejected until every validation issue is resolved; do not create pages during partial repair. Translations and overlap are semantic judgments, not exact-content duplicates. Routing category does not determine relevance. An overlap exclusion requires evidenceQuote copied exactly from the excluded source and counterpartSourceId plus counterpartQuote copied exactly from one source retained by the named offering topic. Compare the substantive case, architecture, steps and limits; a service-family name or shared technology alone is not redundancy. If a distinct fact is missing from the retained evidence, retain the article in the topic instead of excluding it. For translated company or foundation pages, retain both source IDs as foundation reading leads and select appropriate actual citations later. Do not invent an offering coverage anchor for a foundation translation.",
    ),
  reclassifiedOfferings: z
    .array(
      z.object({
        title: SynthesisTitleSchema,
        sourceId: z.uuid(),
        reason: z.string().trim().min(1).max(200),
        evidenceQuote: z.string().trim().min(1).max(500),
      }),
    )
    .max(40)
    .optional()
    .describe(
      "plan repair only: explain why an earlier offering candidate is not a distinct offering. Cite each candidate source separately with an exact supporting quote from freshly read text; never discard an offering just to shorten the plan.",
    ),
  omittedFoundations: z
    .array(z.object({ role: FoundationRoleSchema, reason: z.string().trim().min(1).max(200) }))
    .max(4)
    .optional()
    .describe(
      "plan only: explicitly account for a foundation only when the evidence cannot support useful distinct content. Record these gaps in the guide; never invent content.",
    ),
});
export type ReadWebsiteSourceInput = z.infer<typeof ReadWebsiteSourceSchema>;

const SynthesisSectionSchema = z.object({
  heading: z.string().trim().min(1).max(120),
  evidence: z
    .array(
      z.object({
        sourceId: z.uuid(),
        quote: z
          .string()
          .trim()
          .min(1)
          .max(2_000)
          .describe(
            "One complete exact source sentence or contiguous passage. Prefer a single sentence. Copy the actual text, not its display escaping; never flatten or alter Markdown between lines.",
          ),
      }),
    )
    .min(1)
    .max(8)
    .describe(
      "Select these exact own-source passages before composing content. Every factual sentence and example must be supported by one of them, including its scope, conditions and limitations. Evidence remains private and is not added to the saved page. Ground labelled recommendations in observed wording; keep unknown internal rules in gaps.",
    ),
  content: z
    .string()
    .trim()
    .min(1)
    .max(8_000)
    .describe(
      "Compose after evidence: conservative paraphrases of only supported claims. Attribute published security, compliance, cost, performance and customer outcome claims to their source. Preserve possibility, risk reduction, conditions, limitations and work status; do not turn a warning into a proven countermeasure or infer implementation details.",
    ),
});
const SynthesisPageSchema = z.object({
  title: SynthesisTitleSchema,
  kind: z.enum(["knowledge", "guide", "procedure"]),
  whenToUse: z
    .string()
    .trim()
    .max(WIKI_WHEN_TO_USE_MAX_LENGTH)
    .optional()
    .describe("Procedures only: third-person trigger with the words customers use."),
  sections: z.array(SynthesisSectionSchema).min(1).max(8),
  sourceIds: z
    .array(z.uuid())
    .min(1)
    .max(WIKI_SYNTHESIS_MAX_PAGE_SOURCES)
    .describe("Freshly read sourceIds that directly support every factual claim and example on this page."),
  gaps: z
    .array(z.string().trim().min(1).max(300))
    .max(8)
    .describe(
      "Review missing information explicitly. Ask neutral questions for unknown internal rules, approvals, qualification, follow-up and handover without assuming unverified facts; an empty array means the evidence supports the scope of this page.",
    ),
});
export const WikiCrawlSynthesisCreateSchema = z.object({
  action: z.literal("create"),
  pages: z.array(SynthesisPageSchema).min(1).max(5),
});

export const ReadWikiWebsiteSourcesSchema = ReadWebsiteSourceSchema.extend({ crawlId: z.uuid() });
export const CreateWikiPagesFromCrawlSchema = WikiCrawlSynthesisCreateSchema.omit({ action: true }).extend({
  crawlId: z.uuid(),
});
export const ReadWikiWebsiteSourcesResultSchema = z.object({
  createdPageLinks: z
    .array(z.object({ title: z.string().max(WIKI_TITLE_MAX_LENGTH), path: z.string() }))
    .max(WIKI_SYNTHESIS_MAX_PAGES),
  remainingSources: z.number().int().nonnegative(),
  importedSources: z.number().int().nonnegative(),
  nextAction: z.string(),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
  topicPlan: z.array(WikiSourceTopicSchema).max(WIKI_SYNTHESIS_MAX_PAGES).optional(),
  items: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      url: z.string(),
      category: WikiCrawlCategorySchema,
      headings: z.array(z.string()).optional(),
      chars: z.number().int().nonnegative().optional(),
      imported: z.boolean().optional(),
      read: z.boolean().optional(),
      offset: z.number().int().nonnegative().optional(),
      nextOffset: z.number().int().nonnegative().nullable(),
      text: z.string().optional(),
    }),
  ),
});
export const CreateWikiPagesFromCrawlResultSchema = z.object({
  items: z.array(WikiPageDtoSchema),
  createdPageTitles: z.array(z.string()),
  remainingPageSlots: z.number().int().nonnegative(),
});
