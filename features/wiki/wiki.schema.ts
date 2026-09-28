import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";

export const WIKI_TITLE_MAX_LENGTH = 120;
export const WIKI_WHEN_TO_USE_MAX_LENGTH = 300;
export const WIKI_PAGE_KINDS = ["guide", "procedure", "knowledge"] as const;
export const WikiPageKindSchema = z.enum(WIKI_PAGE_KINDS);
export type WikiPageKind = Data<typeof WikiPageKindSchema>;

export function wikiPageKindFields(page: { kind?: WikiPageKind; whenToUse?: string | null; markdown: string }) {
  const kind = page.kind ?? "knowledge";
  return { kind, whenToUse: kind === "procedure" ? (page.whenToUse ?? null) : null, markdown: page.markdown };
}

const WIKI_PROCEDURE_STEP = /^[ \t]*\d+[.)][ \t]/mu;

export function wikiPageKindIssue(page: {
  kind: WikiPageKind;
  whenToUse: string | null;
  markdown: string;
}): CustomErrorCode | null {
  if (page.kind !== "procedure") return null;
  if (!page.whenToUse) return CustomErrorCode.wikiWhenToUseRequired;
  if (!WIKI_PROCEDURE_STEP.test(page.markdown)) return CustomErrorCode.wikiProcedureNeedsSteps;
  return null;
}

export const WikiMarkdownSchema = z.string().transform((markdown, ctx) => {
  if (markdown.length > MAX_NOTES_LENGTH) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.notesExceedsMaxLength },
    });
    return z.NEVER;
  }

  try {
    const canonical = serializeJSONToMarkdown(parseMarkdownToJSON(markdown));
    if (canonical.length > MAX_NOTES_LENGTH) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.notesExceedsMaxLength },
      });
      return z.NEVER;
    }
    return canonical;
  } catch {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.notesInvalidFormat },
    });
    return z.NEVER;
  }
});

export const WikiPageDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  markdown: z.string(),
  kind: WikiPageKindSchema,
  whenToUse: z.string().nullable(),
  draft: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type WikiPageDto = Data<typeof WikiPageDtoSchema>;

export const WikiPageSummarySchema = WikiPageDtoSchema.omit({ markdown: true });
export type WikiPageSummary = Data<typeof WikiPageSummarySchema>;

export const WIKI_CATALOG_PAGE_SIZE = 10;
export const WikiCatalogInputSchema = z.object({
  page: z.number().int().min(1).default(1),
});
export type WikiCatalogInput = Data<typeof WikiCatalogInputSchema>;
const WikiCatalogItemSchema = WikiPageSummarySchema.pick({
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  excerpt: z.string().max(200),
  url: z.string(),
});
export const WIKI_GUIDE_CONTEXT_MAX_BYTES = 2_400;
export const WIKI_PROCEDURE_INDEX_SIZE = 20;
const WikiCatalogGuideSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  url: z.string(),
  markdown: z.string(),
  nextOffset: z.number().int().min(0).nullable(),
});
const WikiCatalogProcedureSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  url: z.string(),
  whenToUse: z.string(),
});
export const WikiCatalogSchema = z.object({
  guide: WikiCatalogGuideSchema.nullable().optional(),
  procedures: z
    .object({
      items: z.array(WikiCatalogProcedureSchema).max(WIKI_PROCEDURE_INDEX_SIZE),
      total: z.number().int().min(0),
      truncated: z.boolean(),
    })
    .optional(),
  items: z.array(WikiCatalogItemSchema).max(WIKI_CATALOG_PAGE_SIZE),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  nextPage: z.number().int().min(1).nullable(),
  truncated: z.boolean(),
});
export type WikiCatalog = Data<typeof WikiCatalogSchema>;

export const WikiSearchResultSchema = WikiPageSummarySchema.extend({
  snippet: z.string(),
  offset: z.number().int().min(0).optional(),
  section: z.string().optional(),
  anchor: z.string().optional(),
});
export type WikiSearchResult = Data<typeof WikiSearchResultSchema>;

export const WikiTitleSchema = zx.nonBlankText(WIKI_TITLE_MAX_LENGTH).transform((title) => title.trim());

export const WikiWhenToUseSchema = zx.nonBlankText(WIKI_WHEN_TO_USE_MAX_LENGTH).transform((value) => value.trim());

export const WikiPageInputSchema = z
  .object({
    title: WikiTitleSchema,
    markdown: WikiMarkdownSchema,
    kind: WikiPageKindSchema.optional(),
    whenToUse: WikiWhenToUseSchema.optional(),
    draft: z.boolean().optional(),
  })
  .superRefine((page, ctx) => {
    const error = wikiPageKindIssue(wikiPageKindFields(page));
    if (error) {
      ctx.addIssue({
        code: "custom",
        path: [error === CustomErrorCode.wikiWhenToUseRequired ? "whenToUse" : "markdown"],
        params: { error },
      });
    }
  });
export type WikiPageInput = Data<typeof WikiPageInputSchema>;

export const WikiPagePaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(100)]).default(25),
});

export const WikiPageListSchema = WikiPagePaginationSchema.extend({ kind: WikiPageKindSchema.optional() });
export type WikiPageListData = Data<typeof WikiPageListSchema>;

export const WikiPageSearchSchema = WikiPagePaginationSchema.extend({
  query: zx.nonBlankText(200),
});
export type WikiPageSearchData = Data<typeof WikiPageSearchSchema>;

export const WikiPageListResultSchema = z.object({
  items: z.array(WikiPageSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type WikiPageListResult = Data<typeof WikiPageListResultSchema>;

export const WikiPageSearchResultSchema = z.object({
  items: z.array(WikiSearchResultSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  didYouMean: z.array(z.string()).optional(),
  retrieval: z.enum(["semantic", "keyword"]).optional(),
});
export type WikiPageSearchResult = Data<typeof WikiPageSearchResultSchema>;
