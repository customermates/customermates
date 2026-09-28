import type { AppLocale } from "@/i18n/locale-registry";

import { z } from "zod";

import { getCreateWikiPagesInteractor, getWikiWebsiteCrawlRepo } from "@/core/di";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult } from "@/features/mcp-tools/utils";
import { ManageWikiPagesOutputSchema, wikiPageSummary } from "@/features/mcp-tools/wiki.mcp-tools";
import { getTranslator } from "@/i18n/get-translator";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

import { WIKI_IMPORTED_CATEGORIES } from "./wiki-website-crawl.service";

export const WIKI_READ_SOURCE_TOOL_NAME = "read_website_source";
export const WIKI_SYNTHESIS_MAX_PAGES = 16;
const SOURCE_CHUNK_CHARACTERS = 6_000;

const ReadWebsiteSourceSchema = z.object({
  action: z.enum(["list", "get"]).describe("list = every stored page; get = one page by id from offset."),
  id: z.uuid().optional().describe("Source id from list."),
  offset: z.coerce.number().int().min(0).optional().describe("Prior nextOffset."),
});

export function readWebsiteSourceTool(crawlId: string) {
  return {
    name: WIKI_READ_SOURCE_TOOL_NAME,
    title: "Read stored website pages",
    description:
      "Read the website pages this import already fetched. list returns each page's id, url, category, title, length and whether it was imported word for word; get returns one page's text from offset with nextOffset.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: ReadWebsiteSourceSchema,
    outputSchema: z.looseObject({}),
    execute: async (params: z.infer<typeof ReadWebsiteSourceSchema>) => {
      const parsed = ReadWebsiteSourceSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const repo = getWikiWebsiteCrawlRepo();
      if (parsed.data.action === "list") {
        const sources = await repo.listSources(crawlId);
        return toonResult({
          items: sources.map(({ id, url, category, title, text }) => ({
            id,
            url,
            category,
            title,
            chars: text.length,
            imported: WIKI_IMPORTED_CATEGORIES.has(category),
          })),
        });
      }
      const source = parsed.data.id ? await repo.getSource(crawlId, parsed.data.id) : null;
      if (!source) return toonResult({ error: "Unknown source id. Call list first." });
      const offset = Math.min(parsed.data.offset ?? 0, source.text.length);
      const end = Math.min(source.text.length, offset + SOURCE_CHUNK_CHARACTERS);
      return toonResult({
        id: source.id,
        url: source.url,
        title: source.title,
        category: source.category,
        offset,
        nextOffset: end < source.text.length ? end : null,
        text: source.text.slice(offset, end),
      });
    },
  };
}

const SynthesisSectionSchema = z.object({
  heading: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(8_000),
});
const SynthesisPageSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
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

export function createWikiFromCrawlTool(locale: string | undefined, crawlId: string) {
  const appLocale: AppLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    name: "manage_wiki_pages",
    title: "Create Workspace Wiki pages from the website",
    description:
      "Create one to five Wiki pages per call from stored website pages. kind knowledge summarises facts; guide is the one Operating Guide draft; procedure is a draft with whenToUse and numbered steps. Cite sourceIds; the server adds the Sources list with fetch dates and the gaps list. Guides and procedures stay drafts until a person publishes them.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: WikiCrawlSynthesisCreateSchema,
    outputSchema: ManageWikiPagesOutputSchema,
    execute: async (params: z.infer<typeof WikiCrawlSynthesisCreateSchema>) => {
      const parsed = WikiCrawlSynthesisCreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const repo = getWikiWebsiteCrawlRepo();
      const crawl = await repo.getCrawl(crawlId);
      if (!crawl) return toonResult({ error: "This website import is no longer available. Nothing was changed." });
      const created = await repo.countSynthesizedPages(crawl.startedAt);
      if (created + parsed.data.pages.length > WIKI_SYNTHESIS_MAX_PAGES) {
        return toonResult({
          error: `This import may create at most ${WIKI_SYNTHESIS_MAX_PAGES} summary pages; ${created} exist. Nothing was changed.`,
        });
      }
      const sources = new Map((await repo.listSources(crawlId)).map((source) => [source.id, source]));
      const unknown = parsed.data.pages.flatMap(({ sourceIds }) => sourceIds).filter((id) => !sources.has(id));
      if (unknown.length > 0)
        return toonResult({ error: "Cite only ids returned by read_website_source. Nothing was changed." });
      const t = await getTranslator(appLocale, "WikiSetup.generated");
      const pages = parsed.data.pages.map((page) => ({
        title: page.title,
        kind: page.kind,
        whenToUse: page.kind === "procedure" ? page.whenToUse : undefined,
        draft: page.kind !== "knowledge",
        markdown: [
          ...page.sections.map(({ heading, content }) => `## ${heading}\n\n${content}`),
          `## ${t("sourcesHeading")}\n\n${[...new Set(page.sourceIds)]
            .map((id) => {
              const source = sources.get(id);
              return source ? `- <${source.url}> (${source.fetchedAt.toISOString().slice(0, 10)})` : "";
            })
            .join("\n")}`,
          ...(page.gaps?.length ? [`## ${t("gapsHeading")}\n\n${page.gaps.map((gap) => `- ${gap}`).join("\n")}`] : []),
        ].join("\n\n"),
      }));
      return runInteractor(getCreateWikiPagesInteractor().invoke({ requireEmpty: false, pages }), (createdPages) =>
        toonResult({ items: formatDatesInResponse(createdPages.map(wikiPageSummary)) }),
      );
    },
  };
}
