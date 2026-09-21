import { z } from "zod";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiPageInteractor,
  getGetWikiPagesInteractor,
  getSearchWikiPagesInteractor,
  getUpdateWikiPageInteractor,
} from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { wikiCodePointBoundary, wikiMarkdownChunk } from "@/features/wiki/wiki-page-chunk";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { WIKI_TITLE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
import { env } from "@/env";

import {
  customMcpFailure,
  formatDatesInResponse,
  mcpInteractorFailure,
  mcpPage,
  mcpValidationFailure,
  runInteractor,
  toonResult,
  encodeToToon,
} from "./utils";

const WIKI_MCP_TEXT_TARGET_LENGTH = 5_500;
const WikiMcpPageSizeSchema = z.literal(5).default(5).describe("Results per page (fixed at 5)");

const PagingSchema = z.object({
  page: mcpPage(),
  pageSize: WikiMcpPageSizeSchema,
});

const ListSchema = PagingSchema;
const SearchSchema = PagingSchema.extend({
  query: z.string().trim().min(1).max(200),
});
const GetSchema = z.object({
  id: z.uuid(),
  offset: z.coerce.number().int().min(0).default(0),
});
const PageInputSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
  markdown: z.string(),
});
export const WikiHomepageSetupCreateSchema = z.object({
  action: z.literal("create"),
  pages: z.array(PageInputSchema).min(1).max(5),
  requireEmpty: z.literal(true),
});
const CreateSchema = z.object({
  pages: z.array(PageInputSchema).min(1).max(5),
  requireEmpty: z.boolean().default(false),
});
const UpdateSchema = z
  .object({
    id: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
    title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH).optional(),
    markdown: z.string().optional(),
  })
  .refine((data) => data.title !== undefined || data.markdown !== undefined, {
    message: "At least one of title or markdown is required.",
  });
const DeleteSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
});

const ManageWikiPagesSchema = z.object({
  action: z.enum(["list", "search", "get", "create", "update", "delete"]),
  id: z.uuid().optional(),
  query: z.string().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  page: mcpPage(),
  pageSize: WikiMcpPageSizeSchema,
  pages: z.array(PageInputSchema).min(1).max(5).optional(),
  requireEmpty: z.boolean().optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
  title: z.string().optional(),
  markdown: z.string().optional(),
});

const ManageWikiPagesOutputSchema = z.looseObject({
  items: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  id: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  markdown: z.string().optional(),
  markdownChunk: z.string().optional(),
  offset: z.number().optional(),
  nextOffset: z.number().nullable().optional(),
  totalChars: z.number().optional(),
  links: z
    .array(
      z.looseObject({
        id: z.string(),
        label: z.string(),
        url: z.string(),
        fetchId: z.string(),
      }),
    )
    .optional(),
  linksTruncated: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

function pageSummary(page: { id: string; title: string; markdown: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: page.id,
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function wikiPageChunk(
  page: {
    id: string;
    title: string;
    markdown: string;
    createdAt: Date;
    updatedAt: Date;
  },
  requestedOffset: number,
) {
  const discoveredLinks = extractWikiPageLinks(page.markdown, env.BASE_URL, 6);
  const offset = wikiMarkdownChunk(page.markdown, requestedOffset, 0, env.BASE_URL).offset;
  const base = formatDatesInResponse({
    id: page.id,
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    offset,
    nextOffset: null as number | null,
    totalChars: page.markdown.length,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    links: discoveredLinks.slice(0, 5),
    linksTruncated: discoveredLinks.length > 5,
  });
  const payload = (end: number) => ({
    ...base,
    nextOffset: end < page.markdown.length ? end : null,
    markdownChunk: page.markdown.slice(offset, end),
  });

  let low = offset;
  let high = page.markdown.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (encodeToToon(payload(middle)).length <= WIKI_MCP_TEXT_TARGET_LENGTH) low = middle;
    else high = middle - 1;
  }

  const safe = wikiMarkdownChunk(page.markdown, offset, Math.max(0, low - offset), env.BASE_URL);
  const safePayload = payload(safe.nextOffset ?? safe.totalChars);
  return encodeToToon(safePayload).length <= WIKI_MCP_TEXT_TARGET_LENGTH
    ? safePayload
    : payload(wikiCodePointBoundary(page.markdown, low));
}

export const manageWikiPagesTool = {
  name: "manage_wiki_pages",
  title: "Manage Workspace Wiki pages",
  description:
    "Read and manage the shared Workspace Wiki. " +
    "Read company facts, processes, voice, and support guidance before answering or acting on them. " +
    "list returns pages in creation order. search ranks query terms in titles and Markdown and returns short snippets. " +
    "get returns one Markdown chunk; pass nextOffset back as offset until it is null. " +
    "create atomically creates one to five pages; requireEmpty=true refuses the whole batch unless the Wiki is empty. " +
    "update changes title and/or Markdown and requires expectedUpdatedAt from a prior read. " +
    "delete permanently deletes one page and requires expectedUpdatedAt; deletion is irreversible. " +
    "Link pages with ordinary Markdown links to /wiki?page=<page-id>; page ids remain stable when titles change.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageWikiPagesSchema,
  outputSchema: ManageWikiPagesOutputSchema,
  execute: async (params: z.infer<typeof ManageWikiPagesSchema>) => {
    if (params.action === "list") {
      const parsed = ListSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getGetWikiPagesInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse(data)),
      );
    }

    if (params.action === "search") {
      const parsed = SearchSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getSearchWikiPagesInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse(data)),
      );
    }

    if (params.action === "get") {
      const parsed = GetSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const outcome = await getGetWikiPageInteractor().invoke({
        id: parsed.data.id,
      });
      if (!outcome.ok) return mcpInteractorFailure(outcome.error);
      if (!outcome.data) return customMcpFailure(CustomErrorCode.wikiPageNotFound, undefined, ["id"]);

      return toonResult(wikiPageChunk(outcome.data, parsed.data.offset));
    }

    if (params.action === "create") {
      const parsed = CreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getCreateWikiPagesInteractor().invoke(parsed.data), (pages) =>
        toonResult({ items: formatDatesInResponse(pages.map(pageSummary)) }),
      );
    }

    if (params.action === "update") {
      const parsed = UpdateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getUpdateWikiPageInteractor().invoke({
          ...parsed.data,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
        }),
        (page) => toonResult(formatDatesInResponse(pageSummary(page))),
      );
    }

    const parsed = DeleteSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(
      getDeleteWikiPageInteractor().invoke({
        ...parsed.data,
        expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
      }),
      (page) => toonResult({ deleted: true, id: page.id }),
    );
  },
};
