import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";

export const WIKI_TITLE_MAX_LENGTH = 120;

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
const WikiCatalogItemSchema = WikiPageSummarySchema.extend({
  excerpt: z.string().max(200),
  url: z.string(),
});
export const WikiCatalogSchema = z.object({
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

export const WikiPageInputSchema = z.object({
  title: WikiTitleSchema,
  markdown: WikiMarkdownSchema,
});
export type WikiPageInput = Data<typeof WikiPageInputSchema>;

export const WikiPagePaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(100)]).default(25),
});

export const WikiPageListSchema = WikiPagePaginationSchema;
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
