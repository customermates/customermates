import type { WikiPageSearchResult } from "@/features/wiki/wiki.schema";

import { z } from "zod";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiKnowledgeGapsInteractor,
  getGetWikiLinkReportInteractor,
  getGetWikiPageInteractor,
  getGetWikiPageLinksInteractor,
  getGetWikiPagesInteractor,
  getMoveWikiPageInteractor,
  getSearchWikiKnowledgeInteractor,
  getUpdateWikiPageInteractor,
} from "@/core/di";
import { boundedWikiChunk, WIKI_CHUNK_SIZE_FAILURE } from "@/features/wiki/wiki-page-chunk";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { wikiAnchoredSections, wikiOutline } from "@/features/wiki/wiki-markdown-sections";
import { WIKI_PAGE_EDITS_MAX } from "@/features/wiki/wiki-page-edits";
import {
  WikiPageKindSchema,
  WIKI_OWNER_MAX_LENGTH,
  WIKI_TITLE_MAX_LENGTH,
  type WikiPageKind,
} from "@/features/wiki/wiki.schema";
import { MoveWikiPageSchema } from "@/features/wiki/move-wiki-page.interactor";
import { env } from "@/env";

import { UNTRUSTED_RECORD_TEXT_HANDLING, untrustedText } from "./untrusted-record-content";
import { mcpWorkspaceSlug } from "./mcp-workspace-slug";

import {
  formatDatesInResponse,
  mcpInteractorFailure,
  mcpMessageFailure,
  fetchMcpPage,
  mcpOptionalPageSize,
  mcpPage,
  mcpValidationFailure,
  runInteractor,
  toonResult,
  encodeToToon,
} from "./utils";

const WIKI_MCP_TEXT_TARGET_LENGTH = 5_500;
const WIKI_MCP_TEXT_MIN_LENGTH = 2_500;
const WIKI_MCP_TEXT_MAX_LENGTH = 20_000;
const WIKI_MCP_TEXT_RESERVE = 2_000;
const WIKI_MCP_PAGE_SIZE = 5;
const WIKI_MCP_ANCHOR_HINTS = 30;
const WIKI_MCP_LINKED_FROM = 8;
const WIKI_LINKS_SYNCING =
  "Links of recently changed pages are still being read, so this report may miss some. Ask again shortly.";
const WIKI_NO_ADEQUATE_SECTION =
  "No Knowledge Base section adequately answers this query. Do not guess: say the Knowledge Base does not cover it, or ask for details.";

const WIKI_INDEX_REBUILDING =
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
  .describe("Markdown with actual newline characters; escaped backslash-n separators are rejected.");

const ListSchema = z.object({
  page: mcpPage(),
  pageSize: z.coerce.number().int().min(1).max(100).default(WIKI_MCP_PAGE_SIZE),
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
  maxChars: z.coerce
    .number()
    .int()
    .min(WIKI_MCP_TEXT_MIN_LENGTH)
    .max(WIKI_MCP_TEXT_MAX_LENGTH)
    .default(WIKI_MCP_TEXT_TARGET_LENGTH),
});
const OwnerInputSchema = z.string().max(WIKI_OWNER_MAX_LENGTH);
const PageInputSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
  markdown: MarkdownInputSchema,
  kind: WikiPageKindSchema.optional(),
  whenToUse: z.string().optional(),
  owner: OwnerInputSchema.optional().describe("Who keeps the page current: a person, a team or an agent."),
});
const CreateSchema = z.object({
  pages: z.array(PageInputSchema).min(1).max(5),
  requireEmpty: z.boolean().default(false),
});
const EditInputSchema = z.object({
  find: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Exact text to replace, copied from a get of this page. It must occur exactly once in the page, or with anchor exactly once in that section; include more surrounding text when it occurs more often.",
    ),
  replace: z.string().optional().describe("Text that takes the place of find; an empty text removes it."),
  anchor: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Section anchor from a search hit or the outline. With find it limits the search to that section; with markdown it names the section to replace or to insert beside. A section runs from its heading to the following heading of any level.",
    ),
  markdown: MarkdownInputSchema.optional(),
  placement: z
    .enum(["replace", "before", "after", "start", "end"])
    .optional()
    .describe(
      "With anchor and markdown: replace (default) swaps the section including its heading, before or after inserts beside it. With markdown alone: end (default) or start of the page.",
    ),
});
const UpdateSchema = z
  .object({
    id: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
    title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH).optional(),
    markdown: MarkdownInputSchema.optional(),
    edits: z.array(EditInputSchema).min(1).max(WIKI_PAGE_EDITS_MAX).optional(),
    kind: WikiPageKindSchema.optional(),
    whenToUse: z.string().optional(),
    owner: OwnerInputSchema.nullable().optional(),
    verified: z.boolean().optional(),
  })
  .refine(
    (data) =>
      [data.title, data.markdown, data.edits, data.kind, data.whenToUse, data.owner].some(
        (value) => value !== undefined,
      ) || data.verified === true,
    {
      message:
        "update changes nothing: send at least one of title, markdown, edits, kind, whenToUse, owner, or verified true.",
    },
  );
const DeleteSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
});
const LinksSchema = z.object({ id: z.uuid().optional() });

const ManageWikiPagesSchema = z.object({
  action: z
    .enum(["list", "search", "get", "links", "create", "update", "move", "delete", "gaps"])
    .describe(
      "list: page, pageSize, kind; search: query, page; get: id, offset or anchor, maxChars; links: id; create: pages, requireEmpty; update: id, expectedUpdatedAt, title, markdown, edits, kind, whenToUse, owner, verified; move: id, targetId, placement; delete: id, expectedUpdatedAt. update changes only the supplied fields, at least one of them, as top-level fields, and takes markdown or edits, not both. links without id reports on the whole Knowledge Base.",
    ),
  id: z.uuid().optional().describe("Page id."),
  query: z.string().optional().describe("Search terms."),
  offset: z.coerce.number().int().min(0).optional().describe("Hit offset or prior nextOffset."),
  anchor: z
    .string()
    .optional()
    .describe("Section anchor as returned by a search hit or the outline; get returns only that section."),
  maxChars: z.coerce
    .number()
    .int()
    .min(WIKI_MCP_TEXT_MIN_LENGTH)
    .max(WIKI_MCP_TEXT_MAX_LENGTH)
    .optional()
    .describe(
      `get only: the most characters one response holds, ${WIKI_MCP_TEXT_MIN_LENGTH} to ${WIKI_MCP_TEXT_MAX_LENGTH}. Default ${WIKI_MCP_TEXT_TARGET_LENGTH}; a larger value reads a long page in fewer chunks.`,
    ),
  page: mcpPage(),
  pageSize: mcpOptionalPageSize(
    `list only: pages per response, 1 to 100. Default ${WIKI_MCP_PAGE_SIZE}; 100 returns the inventory of most Knowledge Bases at once.`,
  ),
  pages: z.array(PageInputSchema).min(1).max(5).optional().describe("Created atomically."),
  requireEmpty: z.boolean().optional().describe("Only into an empty Knowledge Base."),
  expectedUpdatedAt: z.string().optional().describe("updatedAt from a prior read."),
  targetId: z.uuid().optional().describe("move only: the reference page this page is placed beside."),
  placement: MoveWikiPageSchema.shape.placement
    .optional()
    .describe("move only: before or after targetId in the saved order."),
  title: z.string().optional().describe("New title."),
  markdown: MarkdownInputSchema.optional(),
  edits: z
    .array(EditInputSchema)
    .min(1)
    .max(WIKI_PAGE_EDITS_MAX)
    .optional()
    .describe(
      "update only, in place of markdown: changes to parts of the page, applied in order and all or none, so a long page is not resent. Each edit is one of: find with replace; anchor with markdown; markdown alone.",
    ),
  kind: WikiPageKindSchema.optional(),
  whenToUse: z.string().optional(),
  owner: OwnerInputSchema.nullable()
    .optional()
    .describe("update only: who keeps the page current, a person, a team or an agent; null clears it."),
  verified: z
    .boolean()
    .optional()
    .describe(
      "update only: true records that the page was checked against its sources and is still correct. verifiedAt becomes now; updatedAt moves only when the content changes.",
    ),
});

const ManageWikiPagesOutputSchema = z.looseObject({
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
  linkedFrom: z
    .array(z.looseObject({ id: z.string(), title: z.string() }))
    .optional()
    .describe("Pages that link to this page; a rename, split or delete of the page affects them."),
  linkedFromTotal: z.number().optional(),
  linksTo: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  missingPageIds: z.array(z.string()).optional().describe("Linked page ids that no longer name a live page."),
  records: z.array(z.looseObject({ id: z.string(), pluralLabel: z.string() })).optional(),
  pages: z.number().optional(),
  orphans: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  orphansTotal: z.number().optional(),
  broken: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  brokenTotal: z.number().optional(),
  syncing: z.boolean().optional(),
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
  moved: z.boolean().optional(),
});

type WikiPageKindFields = {
  kind?: WikiPageKind;
  whenToUse?: string | null;
  owner?: string | null;
  verifiedAt?: Date | null;
};

function wikiPageKindOutput(page: WikiPageKindFields) {
  return {
    ...(page.kind && page.kind !== "knowledge" ? { kind: page.kind } : {}),
    ...(page.whenToUse ? { whenToUse: page.whenToUse } : {}),
    ...(page.owner ? { owner: page.owner } : {}),
    ...(page.verifiedAt ? { verifiedAt: page.verifiedAt } : {}),
  };
}

function wikiPageSummary(
  page: {
    id: string;
    title: string;
    markdown: string;
    createdAt: Date;
    updatedAt: Date;
  } & WikiPageKindFields,
  slug: string,
) {
  return {
    id: page.id,
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, slug, page.id),
    ...wikiPageKindOutput(page),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

type WikiAnchoredOutlineEntry = { level: number; heading: string; anchor?: string; offset: number };

function wikiAnchoredOutline(markdown: string): WikiAnchoredOutlineEntry[] {
  const anchors = new Map(wikiAnchoredSections(markdown).map((section) => [section.offset, section.anchor]));
  return wikiOutline(markdown).map(({ level, heading, offset }) => {
    const anchor = anchors.get(offset);
    return { level, heading, ...(anchor ? { anchor } : {}), offset };
  });
}

function wikiPageChunk(
  page: {
    id: string;
    title: string;
    markdown: string;
    createdAt: Date;
    updatedAt: Date;
  } & WikiPageKindFields,
  slug: string,
  requestedOffset: number,
  section?: { end: number; label: string },
  incoming?: Record<string, unknown>,
  target = WIKI_MCP_TEXT_TARGET_LENGTH,
) {
  const limit = section?.end ?? page.markdown.length;
  const source = page.markdown.slice(0, limit);
  const discoveredLinks = extractWikiPageLinks(
    section ? source.slice(requestedOffset) : page.markdown,
    env.BASE_URL,
    slug,
    6,
  );
  let links = discoveredLinks.slice(0, 5);
  let outlineTruncated = false;
  const payload = (offset: number, end: number, outline: WikiAnchoredOutlineEntry[]) =>
    formatDatesInResponse({
      id: page.id,
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, slug, page.id),
      ...wikiPageKindOutput(page),
      ...(section ? { section: section.label } : {}),
      offset,
      nextOffset: end < limit ? end : null,
      totalChars: page.markdown.length,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      links,
      linksTruncated: discoveredLinks.length > links.length,
      ...incoming,
      ...(outlineTruncated ? { outlineTruncated: true } : {}),
      ...(outline.length > 0 ? { outline } : {}),
      markdownChunk: source.slice(offset, end),
    });
  const chunk = (outline: WikiAnchoredOutlineEntry[]) =>
    boundedWikiChunk(
      source,
      requestedOffset,
      (start, stop) => encodeToToon(payload(start, stop, outline)).length <= target,
      env.BASE_URL,
    );
  while (
    links.length &&
    encodeToToon(payload(requestedOffset, requestedOffset, [])).length > target - WIKI_MCP_TEXT_RESERVE
  )
    links = links.slice(0, -1);
  const plain = chunk([]);
  if (!plain) return null;
  const headings = !section && plain.offset === 0 && plain.end < limit ? wikiAnchoredOutline(page.markdown) : [];
  const outline: WikiAnchoredOutlineEntry[] = [];
  for (const heading of headings) {
    if (
      encodeToToon(payload(plain.offset, plain.offset, [...outline, heading])).length >
      target - WIKI_MCP_TEXT_RESERVE
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
      items.map(({ kind, whenToUse, owner, verifiedAt, ...item }) => ({
        ...item,
        ...wikiPageKindOutput({ kind, whenToUse, owner, verifiedAt }),
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
      result.items.map(({ id, title, section, anchor, offset, snippet, createdAt, updatedAt, ...kind }) => ({
        id,
        title,
        ...wikiPageKindOutput(kind),
        section: section ?? "",
        anchor: anchor ?? "",
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

function wikiAnchorSection(markdown: string, anchor: string) {
  const sections = wikiAnchoredSections(markdown);
  const anchors = sections.map((section) => section.anchor);
  const index = anchors.indexOf(anchor);
  if (index < 0) return { anchors: [...new Set(anchors.filter(Boolean))] };
  const found = sections[index];
  return {
    offset: found.offset,
    end: found.end,
    label: found.path.join(" > "),
  };
}

async function wikiIncomingLinks(id: string): Promise<Record<string, unknown> | undefined> {
  try {
    const outcome = await getGetWikiPageLinksInteractor().invoke({ id });
    if (!outcome.ok || outcome.data.linkedFrom.length === 0) return undefined;
    return {
      linkedFrom: outcome.data.linkedFrom.slice(0, WIKI_MCP_LINKED_FROM).map(({ id: pageId, title }) => ({
        id: pageId,
        title,
      })),
      linkedFromTotal: outcome.data.linkedFrom.length,
    };
  } catch {
    return undefined;
  }
}

export const manageWikiPagesTool = {
  name: "manage_wiki_pages",
  title: "Manage Knowledge Base pages",
  description:
    "Knowledge Base of company facts, processes, voice and support guidance. " +
    "kind: guide = the one Operating Guide; procedure = numbered steps + whenToUse; default knowledge. " +
    "list: 5 per page, or pageSize up to 100, guide pinned first, remaining pages in saved order; chars is the length of a page's Markdown. search: hasMore marks further pages; total is a lower bound unless totalIsExact. Returns snippets, section offsets and section anchors, plus didYouMean when a misspelled word was corrected. " +
    "get: one Markdown chunk of up to 5,500 characters, or maxChars up to 20,000 (outline at 0, each heading with its section anchor); nextOffset is the offset of the following chunk and null at the end; updatedAt changes when the page changed between chunks; anchor reads one section. An anchor is unique within its page: a repeated heading takes -2, -3 and so on. The first chunk names up to 8 pages that link to this page (linkedFrom, linkedFromTotal). owner and verifiedAt appear when set; verifiedAt is when someone last confirmed the page, updatedAt when its text last changed. " +
    "links: with id, the pages that link to the page (linkedFrom), the pages it links to (linksTo), linked page ids that no longer exist (missingPageIds) and the record lists it links into; without id, the pages no other page links to (orphans) and the pages with links to deleted pages (broken), 50 each with totals. " +
    "update: edits change parts of a page (find and replace one exact text, replace or insert beside a section by its anchor, or add at the start or end) without resending the whole markdown; the result carries totalChars, and a page holds at most 65,535 characters. " +
    "move: places page id before or after targetId in the saved order; the Operating Guide stays pinned first, so it can neither move nor serve as targetId. " +
    "gaps: questions the Knowledge Base could not answer (editors). " +
    "delete moves the page to Trash, where it is deleted permanently after 30 days; the returned trashBatchId identifies the Trash batch it can be restored from. " +
    "Pages link as /wiki?page=<id>; ids survive renames.",
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
      const { page, pageSize, kind } = parsed.data;
      return runInteractor(
        fetchMcpPage({ page, pageSize }, (pagination) =>
          getGetWikiPagesInteractor().invoke({ ...pagination, ...(kind ? { kind } : {}) }),
        ),
        (data) => wikiListResult({ ...data, page, pageSize }),
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

      const anchored = parsed.data.anchor ? wikiAnchorSection(outcome.data.markdown, parsed.data.anchor) : null;
      if (anchored && anchored.offset === undefined) {
        return mcpMessageFailure(
          `Unknown section anchor "${parsed.data.anchor}". Anchors: ${anchored.anchors.slice(0, WIKI_MCP_ANCHOR_HINTS).join(", ")}`,
        );
      }
      const slug = await mcpWorkspaceSlug();
      const chunk =
        anchored?.offset !== undefined
          ? wikiPageChunk(
              outcome.data,
              slug,
              Math.max(anchored.offset, Math.min(parsed.data.offset, anchored.end)),
              anchored,
              undefined,
              parsed.data.maxChars,
            )
          : wikiPageChunk(
              outcome.data,
              slug,
              parsed.data.offset,
              undefined,
              parsed.data.offset === 0 ? await wikiIncomingLinks(outcome.data.id) : undefined,
              parsed.data.maxChars,
            );
      return chunk ? toonResult(chunk) : mcpMessageFailure(WIKI_CHUNK_SIZE_FAILURE);
    }

    if (params.action === "links") {
      const parsed = LinksSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const { id } = parsed.data;
      if (!id) {
        return runInteractor(getGetWikiLinkReportInteractor().invoke({}), (report) =>
          toonResult({
            ...report,
            ...(report.syncing ? { hint: WIKI_LINKS_SYNCING } : {}),
          }),
        );
      }
      return runInteractor(getGetWikiPageLinksInteractor().invoke({ id }), (links) =>
        toonResult({
          id: links.id,
          linkedFrom: links.linkedFrom,
          linksTo: links.linksTo,
          missingPageIds: links.missingPageIds,
          records: links.records.map(({ id: typeId, pluralLabel, count, list }) => ({
            id: typeId,
            pluralLabel,
            count,
            list,
          })),
        }),
      );
    }

    if (params.action === "gaps") {
      return runInteractor(getGetWikiKnowledgeGapsInteractor().invoke(), ({ items }) =>
        toonResult({
          gapsTrust: "untrusted",
          gapsHandling: UNTRUSTED_RECORD_TEXT_HANDLING,
          gaps: formatDatesInResponse(items.map((item) => ({ ...item, query: untrustedText(item.query) }))),
        }),
      );
    }

    if (params.action === "create") {
      const parsed = CreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const outcome = await getCreateWikiPagesInteractor().invoke(parsed.data);
      if (!outcome.ok) return mcpInteractorFailure(outcome.error);
      const slug = await mcpWorkspaceSlug();
      return toonResult({
        items: formatDatesInResponse(outcome.data.map((page) => wikiPageSummary(page, slug))),
      });
    }

    if (params.action === "update") {
      const parsed = UpdateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const { verified, ...changes } = parsed.data;
      const outcome = await getUpdateWikiPageInteractor().invoke({
        ...changes,
        ...(verified === true ? { verified: true as const } : {}),
        expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
      });
      if (!outcome.ok) return mcpInteractorFailure(outcome.error);
      return toonResult(
        formatDatesInResponse({
          ...wikiPageSummary(outcome.data, await mcpWorkspaceSlug()),
          totalChars: outcome.data.markdown.length,
        }),
      );
    }

    if (params.action === "move") {
      const parsed = MoveWikiPageSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getMoveWikiPageInteractor().invoke(parsed.data), () =>
        toonResult({ moved: true, id: parsed.data.id }),
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
