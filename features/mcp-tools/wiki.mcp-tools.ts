import type { WikiOutlineEntry } from "@/features/wiki/wiki-markdown-sections";
import type { WikiPageSearchResult } from "@/features/wiki/wiki.schema";

import { z } from "zod";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiKnowledgeGapsInteractor,
  getGetWikiPageInteractor,
  getGetWikiPagesInteractor,
  getSearchWikiKnowledgeInteractor,
  getUpdateWikiPageInteractor,
} from "@/core/di";
import { slugifyHeading } from "@/core/utils/search-text";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { boundedWikiChunk, WIKI_CHUNK_SIZE_FAILURE } from "@/features/wiki/wiki-page-chunk";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { wikiMarkdownSections, wikiOutline } from "@/features/wiki/wiki-markdown-sections";
import { WikiPageKindSchema, WIKI_TITLE_MAX_LENGTH, type WikiPageKind } from "@/features/wiki/wiki.schema";
import { env } from "@/env";

import {
  stripUntrustedRecordTextMarkers,
  UNTRUSTED_RECORD_TEXT_CLOSE,
  UNTRUSTED_RECORD_TEXT_HANDLING,
  UNTRUSTED_RECORD_TEXT_OPEN,
} from "./untrusted-record-content";

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
const WIKI_MCP_ANCHOR_HINTS = 30;
export const WIKI_NO_ADEQUATE_SECTION =
  "No Knowledge Base section adequately answers this query. Do not guess: say the Knowledge Base does not cover it, or ask for details.";

export const WIKI_INDEX_REBUILDING =
  "The Knowledge Base search index is still being rebuilt, so some pages were not searched yet. Do not conclude the Knowledge Base lacks this: list pages or search again shortly.";

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
  anchor: z.string().trim().min(1).max(200).optional(),
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
    params: { error: CustomErrorCode.wikiPageUpdateEmpty },
  });
const DeleteSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
});

const ManageWikiPagesSchema = z.object({
  action: z
    .enum(["list", "search", "get", "create", "update", "delete", "gaps"])
    .describe(
      "list: page, kind; search: query, page; get: id, offset or anchor; create: pages, requireEmpty; update: id, expectedUpdatedAt, fields; delete: id, expectedUpdatedAt; gaps: none.",
    ),
  id: z.uuid().optional().describe("Page id."),
  query: z.string().optional().describe("Search terms."),
  offset: z.coerce.number().int().min(0).optional().describe("Hit offset or prior nextOffset."),
  anchor: z.string().optional().describe("Section anchor from search; get returns only that section."),
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
  noAdequateSection: z.boolean().optional(),
  incomplete: z.boolean().optional(),
  hint: z.string().optional(),
  section: z.string().optional(),
  gapsTrust: z.literal("untrusted").optional(),
  gapsHandling: z.string().optional(),
  gaps: z
    .array(
      z.looseObject({
        query: z.string(),
        count: z.number(),
        firstSeenAt: z.string(),
        lastSeenAt: z.string(),
      }),
    )
    .optional(),
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
  section?: { end: number; label: string },
) {
  const limit = section?.end ?? page.markdown.length;
  const source = page.markdown.slice(0, limit);
  const discoveredLinks = extractWikiPageLinks(
    section ? source.slice(requestedOffset) : page.markdown,
    env.BASE_URL,
    6,
  );
  let links = discoveredLinks.slice(0, 5);
  let outlineTruncated = false;
  const payload = (offset: number, end: number, outline: WikiOutlineEntry[]) =>
    formatDatesInResponse({
      id: page.id,
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, page.id),
      ...wikiPageKindOutput(page),
      ...(section ? { section: section.label } : {}),
      offset,
      nextOffset: end < limit ? end : null,
      totalChars: page.markdown.length,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      links,
      linksTruncated: discoveredLinks.length > links.length,
      ...(outlineTruncated ? { outlineTruncated: true } : {}),
      ...(outline.length > 0 ? { outline } : {}),
      markdownChunk: source.slice(offset, end),
    });
  const chunk = (outline: WikiOutlineEntry[]) =>
    boundedWikiChunk(
      source,
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
  if (!plain) return null;
  const headings = !section && plain.offset === 0 && plain.end < limit ? wikiOutline(page.markdown) : [];
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
  const selected = outline.length > 0 ? chunk(outline) : plain;
  if (!selected) return null;
  const { offset, end } = selected;
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
    ...(result.abstained ? { noAdequateSection: true, hint: WIKI_NO_ADEQUATE_SECTION } : {}),
    ...(result.incomplete ? { incomplete: true, hint: WIKI_INDEX_REBUILDING } : {}),
  });
}

function untrustedGapQuery(query: string) {
  return `${UNTRUSTED_RECORD_TEXT_OPEN}\n${stripUntrustedRecordTextMarkers(query)}\n${UNTRUSTED_RECORD_TEXT_CLOSE}`;
}

function wikiAnchorSection(markdown: string, anchor: string) {
  const sections = wikiMarkdownSections(markdown).filter((section) => section.level > 0);
  const anchors = sections.map((section) => slugifyHeading(section.path.at(-1) ?? ""));
  const index = anchors.indexOf(anchor);
  if (index < 0) return { anchors: [...new Set(anchors.filter(Boolean))] };
  const found = sections[index];
  return {
    offset: found.offset,
    end: found.end,
    label: found.path.join(" > "),
  };
}

export const manageWikiPagesTool = {
  name: "manage_wiki_pages",
  title: "Manage Knowledge Base pages",
  description:
    "Knowledge Base of company facts, processes, voice and support guidance. " +
    "kind: guide = the one Operating Guide; procedure = numbered steps + whenToUse; default knowledge. " +
    "list: 5 per page, guide pinned first, remaining pages in saved order; search: follow hasMore to continue; total is a lower bound unless totalIsExact. Returns snippets and section offsets, plus didYouMean when a misspelled word was corrected. " +
    "get: one Markdown chunk (outline at 0); repeat with nextOffset until null; restart at 0 if updatedAt changes; anchor reads one section. " +
    "gaps: questions the Knowledge Base could not answer (editors). " +
    "delete moves the page to Trash, where it is deleted permanently after 30 days unless manage_trash restores it with the returned trashBatchId. " +
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

      const anchored = parsed.data.anchor ? wikiAnchorSection(outcome.data.markdown, parsed.data.anchor) : null;
      if (anchored && anchored.offset === undefined) {
        return mcpMessageFailure(
          `Unknown section anchor "${parsed.data.anchor}". Anchors: ${anchored.anchors.slice(0, WIKI_MCP_ANCHOR_HINTS).join(", ")}`,
        );
      }
      const chunk =
        anchored?.offset !== undefined
          ? wikiPageChunk(outcome.data, Math.max(anchored.offset, Math.min(parsed.data.offset, anchored.end)), anchored)
          : wikiPageChunk(outcome.data, parsed.data.offset);
      return chunk ? toonResult(chunk) : mcpMessageFailure(WIKI_CHUNK_SIZE_FAILURE);
    }

    if (params.action === "gaps") {
      return runInteractor(getGetWikiKnowledgeGapsInteractor().invoke(), ({ items }) =>
        toonResult({
          gapsTrust: "untrusted",
          gapsHandling: UNTRUSTED_RECORD_TEXT_HANDLING,
          gaps: formatDatesInResponse(items.map((item) => ({ ...item, query: untrustedGapQuery(item.query) }))),
        }),
      );
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
      (page) => toonResult({ deleted: true, id: page.id, trashBatchId: page.trashBatchId }),
    );
  },
};
