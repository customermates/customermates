import type { WikiOutlineEntry } from "@/features/wiki/wiki-search";
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
import { boundedWikiChunk } from "@/features/wiki/wiki-page-chunk";
import {
  extractWikiPageLinks,
  wikiMarkdownHasHeadings,
  wikiMarkdownHasLinksOrImages,
  wikiMarkdownPlainText,
} from "@/features/wiki/wiki-markdown-links";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { wikiOutline } from "@/features/wiki/wiki-search";
import { WikiMarkdownSchema, WIKI_TITLE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
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
const WIKI_MCP_PAGE_SIZE = 5;

const ListSchema = z.object({ page: mcpPage() });
const SearchSchema = ListSchema.extend({
  query: z.string().trim().min(1).max(200),
});
const GetSchema = z.object({
  id: z.uuid(),
  offset: z.coerce.number().int().min(0).default(0),
});
const PublicSourceUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Source URL must use HTTP(S).");
const PageInputSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
  markdown: z.string(),
});
export const WIKI_HOMEPAGE_RESERVED_HEADINGS = new Set(
  [
    "Sources",
    "Gaps to confirm",
    "Quellen",
    "Noch zu klären",
    "Fuentes",
    "Aspectos por confirmar",
    "Points à confirmer",
    "Fonti",
    "Aspetti da confermare",
  ].map((heading) => heading.toLocaleLowerCase()),
);
function normalizeWikiHomepageText(value: string) {
  return value.replace(/[ \t]*—[ \t]*/gu, " - ").trim();
}

function normalizeWikiHomepageLine(value: string) {
  const canonical = WikiMarkdownSchema.safeParse(value);
  return normalizeWikiHomepageText(wikiMarkdownPlainText(canonical.success ? canonical.data : value)).replace(
    /[ \t]+#{1,6}[ \t]*$/u,
    "",
  );
}

function normalizeWikiHomepageContent(value: string) {
  const canonical = WikiMarkdownSchema.safeParse(value);
  const normalized = normalizeWikiHomepageText(canonical.success ? canonical.data : value)
    .replace(/^#{1,6}[ \t]+/gmu, "")
    .trim();
  const reparsed = WikiMarkdownSchema.safeParse(normalized);
  return reparsed.success ? reparsed.data.trim() : "";
}

function wikiHomepageLineSchema(maxLength: number) {
  const plainLine = (schema: z.ZodString) =>
    schema
      .refine((value) => !/[\r\n]/u.test(value), "Use one line.")
      .refine((value) => !wikiMarkdownHasLinksOrImages(value), "Links and images are not allowed here.");
  return plainLine(z.string().trim().min(1).max(maxLength))
    .transform(normalizeWikiHomepageLine)
    .pipe(
      plainLine(z.string().min(1, "Use text, not only Markdown markers.").max(maxLength)).refine(
        (value) => !wikiMarkdownHasHeadings(value),
        "Use plain text without Markdown headings.",
      ),
    );
}

const WikiHomepageSectionHeadingSchema = wikiHomepageLineSchema(120).refine(
  (value) => !WIKI_HOMEPAGE_RESERVED_HEADINGS.has(value.toLocaleLowerCase()),
  "Sources and gaps headings are added by the server.",
);
const WikiHomepageSectionContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_000)
  .transform(normalizeWikiHomepageContent)
  .pipe(
    z
      .string()
      .min(1)
      .max(8_000)
      .refine((value) => !wikiMarkdownHasHeadings(value), "Section content cannot contain headings.")
      .refine(
        (value) => !wikiMarkdownHasLinksOrImages(value),
        "Section content cannot contain links or images; source links are added by the server.",
      ),
  );
const WikiHomepageSectionSchema = z.object({
  heading: WikiHomepageSectionHeadingSchema.describe(
    "Short descriptive heading in the requested language. Do not include Markdown # markers.",
  ),
  content: WikiHomepageSectionContentSchema.describe(
    "Concise evidence-backed Markdown paragraphs or lists for this section. Do not include any headings, sources, gaps, or em dashes.",
  ),
});
const WikiHomepageSetupPageSchema = z.object({
  title: wikiHomepageLineSchema(WIKI_TITLE_MAX_LENGTH).describe(
    "Short page title in the requested language that names the knowledge area this page covers. Unique within the call.",
  ),
  sections: z
    .array(WikiHomepageSectionSchema)
    .min(1)
    .max(5)
    .describe(
      "One to five complementary sections containing only durable facts directly supported by successfully read pages. One strong section is better than several weak ones. Omit trials and offers, plan names, pricing, limits, plan gating, inferred audiences, and unsupported approval behavior. The server renders each heading as H2.",
    ),
  sources: z
    .array(PublicSourceUrlSchema)
    .min(1)
    .max(4)
    .describe(
      "One to four exact successful read_public_page result URLs used as evidence for this page's sections. The server lists them under a localized Sources heading.",
    ),
  gaps: z
    .array(wikiHomepageLineSchema(300))
    .max(5)
    .optional()
    .describe(
      "Up to five short questions in the requested language about details this page needs but the read pages did not state. Name the specific missing detail; never answer it with a guess. The server lists them under a localized gaps heading.",
    ),
});
export const WikiHomepageSetupCreateSchema = z
  .object({
    action: z.literal("create"),
    pages: z
      .array(WikiHomepageSetupPageSchema)
      .min(1)
      .max(5)
      .describe(
        "One to five pages, one per knowledge area the read pages support. Merge thin areas into a related page and skip areas without evidence.",
      ),
    requireEmpty: z.literal(true),
  })
  .superRefine((data, ctx) => {
    const titles = new Set<string>();
    data.pages.forEach(({ title }, index) => {
      const key = title.toLocaleLowerCase();
      if (titles.has(key))
        ctx.addIssue({ code: "custom", message: "Each page title must be unique.", path: ["pages", index, "title"] });
      titles.add(key);
    });
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
  action: z
    .enum(["list", "search", "get", "create", "update", "delete"])
    .describe(
      "list = optional page; search = query, optional page; get = id, optional offset; create = pages, optional requireEmpty; update = id, expectedUpdatedAt, title and/or markdown; delete = id, expectedUpdatedAt.",
    ),
  id: z.uuid().optional().describe("Page id."),
  query: z.string().optional().describe("Search terms."),
  offset: z.coerce.number().int().min(0).optional().describe("Hit offset or prior nextOffset."),
  page: mcpPage(),
  pages: z.array(PageInputSchema).min(1).max(5).optional().describe("Created atomically."),
  requireEmpty: z.boolean().optional().describe("Refuses create unless the Wiki is empty."),
  expectedUpdatedAt: z.string().optional().describe("updatedAt from a prior read."),
  title: z.string().optional().describe("New title."),
  markdown: z.string().optional().describe("New Markdown."),
});

export const ManageWikiPagesOutputSchema = z.looseObject({
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
  outline: z.array(z.looseObject({ level: z.number(), heading: z.string(), offset: z.number() })).optional(),
  didYouMean: z.array(z.string()).optional(),
  retrieval: z.enum(["semantic", "keyword"]).optional(),
  deleted: z.boolean().optional(),
});

export function wikiPageSummary(page: {
  id: string;
  title: string;
  markdown: string;
  createdAt: Date;
  updatedAt: Date;
}) {
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
  const payload = (offset: number, end: number, outline: WikiOutlineEntry[]) =>
    formatDatesInResponse({
      id: page.id,
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, page.id),
      offset,
      nextOffset: end < page.markdown.length ? end : null,
      totalChars: page.markdown.length,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      links: discoveredLinks.slice(0, 5),
      linksTruncated: discoveredLinks.length > 5,
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
  const plain = chunk([]);
  const outline = plain.offset === 0 && plain.end < page.markdown.length ? wikiOutline(page.markdown) : [];
  const { offset, end } = outline.length > 1 ? chunk(outline) : plain;
  return payload(offset, end, outline.length > 1 ? outline : []);
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
  items: unknown[];
}) {
  return toonResult({ total, page, pageSize, items: formatDatesInResponse(items) });
}

function wikiSearchResult(result: WikiPageSearchResult) {
  return toonResult({
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    items: formatDatesInResponse(
      result.items.map(({ id, title, section, offset, snippet, createdAt, updatedAt }) => ({
        id,
        title,
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
  title: "Manage Workspace Wiki pages",
  description:
    "Read and manage the shared Workspace Wiki of company facts, processes, voice, and support guidance. " +
    "list returns 5 pages in creation order; search returns snippets and each hit's section offset, or didYouMean. " +
    "get returns one Markdown chunk (outline at 0); pass nextOffset back as offset until it is null. If updatedAt differs from the previous chunk, restart at offset 0. " +
    "action delete is IRREVERSIBLE. " +
    "Link pages with Markdown links to /wiki?page=<page-id>; ids stay stable when titles change.",
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
        getGetWikiPagesInteractor().invoke({ ...parsed.data, pageSize: WIKI_MCP_PAGE_SIZE }),
        wikiListResult,
      );
    }

    if (params.action === "search") {
      const parsed = SearchSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getSearchWikiKnowledgeInteractor().invoke({ ...parsed.data, pageSize: WIKI_MCP_PAGE_SIZE }),
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

      return toonResult(wikiPageChunk(outcome.data, parsed.data.offset));
    }

    if (params.action === "create") {
      const parsed = CreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getCreateWikiPagesInteractor().invoke(parsed.data), (pages) =>
        toonResult({ items: formatDatesInResponse(pages.map(wikiPageSummary)) }),
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
