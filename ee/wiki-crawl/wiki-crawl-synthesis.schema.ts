import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH, WikiPageDtoSchema } from "@/features/wiki/wiki.schema";
import { WikiCrawlCategorySchema } from "./website-discovery";

export const WIKI_SYNTHESIS_MAX_PAGES = 16;

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

export const WikiSourceTopicSchema = z.object({
  title: SynthesisTitleSchema,
  role: z.enum(["offering", "procedure", ...WIKI_SYNTHESIS_FOUNDATION_ROLES, "operating_guide"]).default("offering"),
  sourceIds: z.array(z.uuid()).min(1).max(40),
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
  })
  .superRefine((value, context) => {
    const hasDuplicate = value.duplicateOfSourceId !== undefined;
    const hasCoverage = value.coveredByTitle !== undefined || value.coveredByRole !== undefined;
    const hasEvidence = value.evidenceQuote !== undefined;
    const valid =
      value.basis === "already_imported"
        ? !hasDuplicate && !hasCoverage && !hasEvidence
        : value.basis === "exact_duplicate"
          ? hasDuplicate && !hasCoverage && !hasEvidence
          : value.basis === "overlap"
            ? value.coveredByTitle !== undefined && value.coveredByRole !== undefined && !hasDuplicate && !hasEvidence
            : hasEvidence && !hasDuplicate && !hasCoverage;
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
      "plan only: exact titles, roles and supporting sources for offerings, four foundations, supported procedures and the Operating Guide. Combine translations; the same source can support several distinct topics. Offering and procedure citations stay within planned sourceIds; aggregate foundations and the guide may cite other fully read sources in the same crawl.",
    ),
  excluded: z
    .array(WikiSourceExclusionSchema)
    .max(40)
    .optional()
    .describe(
      "plan only: one source per exclusion with a reason and basis. already_imported requires an unchanged imported source. exact_duplicate names duplicateOfSourceId with identical stored content, retained in a topic or already imported. overlap names the exact coveredByTitle of a retained offering and coveredByRole=offering; foundations cannot replace offerings. not_substantive requires an exact evidenceQuote from that source. Translations and overlap are semantic judgments, not exact-content duplicates. Routing category does not determine relevance.",
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
  content: z.string().trim().min(1).max(8_000),
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
    .max(4)
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
