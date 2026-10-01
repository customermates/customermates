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
      "plan only: exact titles, roles and supporting sources for offerings, four foundations, supported procedures and the Operating Guide. Combine translations; the same source can support several distinct topics.",
    ),
  excluded: z
    .array(z.object({ sourceIds: z.array(z.uuid()).min(1).max(40), reason: z.string().trim().min(1).max(200) }))
    .max(40)
    .optional()
    .describe(
      "plan only: account for sources unused by any planned page with an explicit reason, such as already imported, duplicate, or no substantive company information. Routing category does not determine topic relevance.",
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
  sourceIds: z.array(z.uuid()).min(1).max(4).describe("Ids from read_website_source that support this page."),
  gaps: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
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
