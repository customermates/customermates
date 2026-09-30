import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH, WikiPageDtoSchema } from "@/features/wiki/wiki.schema";

export const WIKI_SYNTHESIS_MAX_PAGES = 16;

export const ReadWebsiteSourceSchema = z.object({
  action: z
    .enum(["list", "get", "next"])
    .describe(
      "list = source inventory; next = unread chunks of up to eight sources; get = reread one source only after remainingSources is zero.",
    ),
  id: z.uuid().optional().describe("Source id from list."),
  offset: z.coerce.number().int().min(0).optional().describe("Prior nextOffset; get must not skip unread text."),
});

const SynthesisSectionSchema = z.object({
  heading: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(8_000),
});
const SynthesisPageSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(WIKI_TITLE_MAX_LENGTH)
    .refine((title) => !/[}\]]\s*,\s*[{[]?\s*"?[a-zA-Z]\w*"?\s*:/.test(title), {
      params: { error: CustomErrorCode.wikiImportTitleInvalid },
    }),
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
  remainingSources: z.number().int().nonnegative(),
  importedSources: z.number().int().nonnegative(),
  nextAction: z.string(),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
  items: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      url: z.string(),
      category: z.string(),
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
