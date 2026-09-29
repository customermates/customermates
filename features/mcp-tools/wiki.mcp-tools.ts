import type { WikiOutlineEntry } from "@/features/wiki/wiki-markdown-sections";
import type { WikiPageSearchResult } from "@/features/wiki/wiki.schema";

import { z } from "zod";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiPageInteractor,
  getGetWikiPagesInteractor,
  getSearchWikiKnowledgeInteractor,
  getUpdateWikiPageInteractor,
} from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { boundedWikiChunk, WikiChunkSizeError } from "@/features/wiki/wiki-page-chunk";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { wikiOutline } from "@/features/wiki/wiki-markdown-sections";
import { WikiPageKindSchema, WIKI_TITLE_MAX_LENGTH, type WikiPageKind } from "@/features/wiki/wiki.schema";
import { env } from "@/env";

import {
  customMcpFailure,
  formatDatesInResponse,
  mcpInteractorFailure,
  mcpMessageFailure,
  mcpPage,
  mcpValidationFailure,
  runInteractor,
  toonResult,
  encodeToToon,
} from "./utils";

const WIKI_MCP_TEXT_TARGET_LENGTH = 5_500;
const WIKI_MCP_PAGE_SIZE = 5;

const MarkdownInputSchema = z
  .string()
  .refine(
    (value) =>
      value.includes("\n") ||
      value.includes("`") ||
      !/^(?:#{1,6} |\d+\. |- )/u.test(value) ||
      !/\\+n(?:\\+n)*(?:#{1,6} |\d+\. |- )/u.test(value),
    {
      message:
        "Markdown contains escaped line breaks. Retry with actual newline characters between headings and steps.",
    },
  )
  .describe("Markdown with actual newline characters, never literal backslash-n separators.");

const ListSchema = z.object({
  page: mcpPage(),
  kind: WikiPageKindSchema.optional(),
});
const SearchSchema = z.object({
  page: mcpPage(),
  query: z.string().trim().min(1).max(200),
});
const GetSchema = z.object({
  id: z.uuid(),
  offset: z.coerce.number().int().min(0).default(0),
});
const PageInputSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
  markdown: MarkdownInputSchema,
  kind: WikiPageKindSchema.optional(),
  whenToUse: z.string().optional(),
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
    markdown: MarkdownInputSchema.optional(),
    kind: WikiPageKindSchema.optional(),
    whenToUse: z.string().optional(),
  })
  .refine((data) => [data.title, data.markdown, data.kind, data.whenToUse].some((value) => value !== undefined), {
    message: "Nothing to update.",
  });
const DeleteSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
});

const ManageWikiPagesSchema = z.object({
  action: z
    .enum(["list", "search", "get", "create", "update", "delete"])
    .describe(
      "list: page, kind; search: query, page; get: id, offset; create: pages, requireEmpty; update: id, expectedUpdatedAt, fields; delete: id, expectedUpdatedAt.",
    ),
  id: z.uuid().optional().describe("Page id."),
  query: z.string().optional().describe("Search terms."),
  offset: z.coerce.number().int().min(0).optional().describe("Hit offset or prior nextOffset."),
  page: mcpPage(),
  pages: z.array(PageInputSchema).min(1).max(5).optional().describe("Created atomically."),
  requireEmpty: z.boolean().optional().describe("Only into an empty Knowledge Base."),
  expectedUpdatedAt: z.string().optional().describe("updatedAt from a prior read."),
  title: z.string().optional().describe("New title."),
  markdown: MarkdownInputSchema.optional(),
  kind: WikiPageKindSchema.optional(),
  whenToUse: z.string().optional(),
});

export const ManageWikiPagesOutputSchema = z.looseObject({
  items: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  total: z.number().optional(),
  totalIsExact: z.boolean().optional(),
  hasMore: z.boolean().optional(),
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
  outlineTruncated: z.boolean().optional().describe("Some headings were omitted to keep the response bounded."),
  outline: z
    .array(
      z.looseObject({
        level: z.number(),
        heading: z.string(),
        offset: z.number(),
      }),
    )
    .optional(),
  didYouMean: z.array(z.string()).optional(),
  retrieval: z.enum(["semantic", "keyword"]).optional(),
  deleted: z.boolean().optional(),
});

type WikiPageKindFields = {
  kind?: WikiPageKind;
  whenToUse?: string | null;
};

function wikiPageKindOutput(page: WikiPageKindFields) {
  return {
    ...(page.kind && page.kind !== "knowledge" ? { kind: page.kind } : {}),
    ...(page.whenToUse ? { whenToUse: page.whenToUse } : {}),
  };
}

export function wikiPageSummary(
  page: {
    id: string;
    title: string;
    markdown: string;
    createdAt: Date;
    updatedAt: Date;
  } & WikiPageKindFields,
) {
  return {
    id: page.id,
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    ...wikiPageKindOutput(page),
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
  } & WikiPageKindFields,
  requestedOffset: number,
) {
  const discoveredLinks = extractWikiPageLinks(page.markdown, env.BASE_URL, 6);
  let links = discoveredLinks.slice(0, 5);
  let outlineTruncated = false;
  const payload = (offset: number, end: number, outline: WikiOutlineEntry[]) =>
    formatDatesInResponse({
      id: page.id,
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, page.id),
      ...wikiPageKindOutput(page),
      offset,
      nextOffset: end < page.markdown.length ? end : null,
      totalChars: page.markdown.length,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      links,
      linksTruncated: discoveredLinks.length > links.length,
      ...(outlineTruncated ? { outlineTruncated: true } : {}),
      ...(outline.length > 0 ? { outline } : {}),
      markdownChunk: page.markdown.slice(offset, end),
    });
  const chunk = (outline: WikiOutlineEntry[]) =>
    boundedWikiChunk(
      page.markdown,
      requestedOffset,
      (start, stop) => encodeToToon(payload(start, stop, outline)).length <= WIKI_MCP_TEXT_TARGET_LENGTH,
      env.BASE_URL,
    );
  while (
    links.length &&
    encodeToToon(payload(requestedOffset, requestedOffset, [])).length > WIKI_MCP_TEXT_TARGET_LENGTH - 2_000
  )
    links = links.slice(0, -1);
  const plain = chunk([]);
  const headings = plain.offset === 0 && plain.end < page.markdown.length ? wikiOutline(page.markdown) : [];
  const outline: WikiOutlineEntry[] = [];
  for (const heading of headings) {
    if (
      encodeToToon(payload(plain.offset, plain.offset, [...outline, heading])).length >
      WIKI_MCP_TEXT_TARGET_LENGTH - 2_000
    )
      break;
    outline.push(heading);
  }
  outlineTruncated = outline.length < headings.length;
  const { offset, end } = outline.length > 0 ? chunk(outline) : plain;
  return payload(offset, end, outline);
}

function wikiListResult({
  total,
  page,
  pageSize,
  items,
}: {
  total: number;
  page: number;
  pageSize: number;
  items: Array<Record<string, unknown> & WikiPageKindFields>;
}) {
  return toonResult({
    total,
    page,
    pageSize,
    items: formatDatesInResponse(
      items.map(({ kind, whenToUse, ...item }) => ({
        ...item,
        ...wikiPageKindOutput({ kind, whenToUse }),
      })),
    ),
  });
}

function wikiSearchResult(result: WikiPageSearchResult) {
  return toonResult({
    total: result.total,
    ...(result.totalIsExact !== undefined ? { totalIsExact: result.totalIsExact } : {}),
    ...(result.hasMore !== undefined ? { hasMore: result.hasMore } : {}),
    page: result.page,
    pageSize: result.pageSize,
    items: formatDatesInResponse(
      result.items.map(({ id, title, section, offset, snippet, createdAt, updatedAt, ...kind }) => ({
        id,
        title,
        ...wikiPageKindOutput(kind),
        section: section ?? "",
        offset: offset ?? 0,
        snippet,
        createdAt,
        updatedAt,
      })),
    ),
    ...(result.didYouMean ? { didYouMean: result.didYouMean } : {}),
    ...(result.retrieval ? { retrieval: result.retrieval } : {}),
  });
}

export const manageWikiPagesTool = {
  name: "manage_wiki_pages",
  title: "Manage Knowledge Base pages",
  description:
    "Knowledge Base of company facts, processes, voice and support guidance. " +
    "kind: guide = the one Operating Guide; procedure = numbered steps + whenToUse; default knowledge. " +
    "list: 5 per page, guide and procedures first; search: follow hasMore to continue; total is a lower bound unless totalIsExact. Returns snippets and section offsets, plus didYouMean when a misspelled word was corrected. " +
    "get: one Markdown chunk (outline at 0); repeat with nextOffset until null; restart at 0 if updatedAt changes. " +
    "delete is IRREVERSIBLE. " +
    "Link pages as /wiki?page=<id>; ids survive renames.",
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
      return runInteractor(
        getGetWikiPagesInteractor().invoke({
          ...parsed.data,
          pageSize: WIKI_MCP_PAGE_SIZE,
        }),
        wikiListResult,
      );
    }

    if (params.action === "search") {
      const parsed = SearchSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getSearchWikiKnowledgeInteractor().invoke({
          ...parsed.data,
          pageSize: WIKI_MCP_PAGE_SIZE,
        }),
        wikiSearchResult,
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

      try {
        return toonResult(wikiPageChunk(outcome.data, parsed.data.offset));
      } catch (error) {
        if (error instanceof WikiChunkSizeError) return mcpMessageFailure(error.message);
        throw error;
      }
    }

    if (params.action === "create") {
      const parsed = CreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getCreateWikiPagesInteractor().invoke(parsed.data), (pages) =>
        toonResult({
          items: formatDatesInResponse(pages.map(wikiPageSummary)),
        }),
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
        (page) => toonResult(formatDatesInResponse(wikiPageSummary(page))),
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
