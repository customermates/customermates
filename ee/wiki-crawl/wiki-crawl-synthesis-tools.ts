import { wikiLanguageConflicts } from "@/features/wiki/wiki-language";
import { z } from "zod";

import { getCreateWikiPagesInteractor, getWikiWebsiteCrawlRepo } from "@/core/di";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
import {
  encodeToToon,
  formatDatesInResponse,
  mcpMessageFailure,
  mcpValidationFailure,
  runInteractor,
  toonResult,
} from "@/features/mcp-tools/utils";
import { ManageWikiPagesOutputSchema, wikiPageSummary } from "@/features/mcp-tools/wiki.mcp-tools";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import { wikiSynthesisSectionMarkdown } from "./wiki-synthesis-markdown";

export const WIKI_READ_SOURCE_TOOL_NAME = "read_website_source";
export const WIKI_SYNTHESIS_MAX_PAGES = 16;
import { sourceFullyRead, wikiSourceCoverage, WIKI_SOURCE_RESULT_MAX_CHARS } from "./wiki-source-coverage";

const SOURCE_CHUNK_CHARACTERS = 5_500;

function sourceFailure(payload: { error: string } & Record<string, unknown>) {
  return {
    text: encodeToToon(payload),
    structuredContent: payload,
    failure: mcpMessageFailure(payload.error).failure,
  };
}

const ReadWebsiteSourceSchema = z.object({
  action: z
    .enum(["list", "get", "next"])
    .describe(
      "list = source inventory; next = next unread chunks of up to four sources; get = one source from its sequential offset.",
    ),
  id: z.uuid().optional().describe("Source id from list."),
  offset: z.coerce.number().int().min(0).optional().describe("Prior nextOffset; get must not skip unread text."),
});

export function readWebsiteSourceTool(crawlId: string) {
  return {
    name: WIKI_READ_SOURCE_TOOL_NAME,
    title: "Read stored website pages",
    description:
      "Read all stored evidence before creating pages. list inventories sources; next returns bounded sequential chunks from up to four unread sources. Repeat next until remainingSources is zero. get reads one source, including imported sources you cite; follow nextOffset. Cursors persist across retries. Exact duplicate content needs reading only once.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: ReadWebsiteSourceSchema,
    outputSchema: z.looseObject({}),
    execute: async (params: z.infer<typeof ReadWebsiteSourceSchema>) => {
      const parsed = ReadWebsiteSourceSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const repo = getWikiWebsiteCrawlRepo();
      const coverage = await wikiSourceCoverage(repo, crawlId);
      if (parsed.data.action === "list") {
        const start = Math.min(parsed.data.offset ?? 0, coverage.sources.length);
        const items = coverage.sources.slice(start, start + 10).map((source) => ({
          id: source.id,
          url: source.url,
          category: source.category,
          title: source.title,
          headings: [...source.text.matchAll(/^#{1,4}\s+(.+)$/gm)].slice(0, 12).map((match) => match[1].slice(0, 120)),
          chars: source.text.length,
          imported: coverage.imported.has(source.id),
          read: coverage.readHashes.has(source.contentHash),
          nextOffset: sourceFullyRead(source) ? null : source.readOffset,
        }));
        while (items.length > 1 && encodeToToon({ items }).length > WIKI_SOURCE_RESULT_MAX_CHARS - 200) items.pop();
        return toonResult({
          items,
          nextOffset: start + items.length < coverage.sources.length ? start + items.length : null,
          remainingSources: coverage.pending.length,
          importedSources: coverage.imported.size,
        });
      }
      const selected =
        parsed.data.action === "next"
          ? coverage.pending.slice(0, 4)
          : coverage.sources.filter(({ id }) => id === parsed.data.id);
      if (parsed.data.action === "get" && selected.length === 0)
        return sourceFailure({ error: "Unknown source id. Call list first." });
      const items = selected.map((source) => {
        const offset = parsed.data.action === "get" ? (parsed.data.offset ?? source.readOffset) : source.readOffset;
        if (offset > source.readOffset || offset > source.text.length) return null;
        const end = Math.min(source.text.length, offset + SOURCE_CHUNK_CHARACTERS);
        return {
          id: source.id,
          title: source.title,
          url: source.url,
          category: source.category,
          offset,
          nextOffset: end < source.text.length ? end : null,
          text: source.text.slice(offset, end),
        };
      });
      if (items.some((item) => item === null)) {
        return sourceFailure({
          error: "Read sequentially without skipping text. Use next or the stored nextOffset from list.",
        });
      }
      const chunks = items.filter((item) => item !== null);
      while (encodeToToon({ items: chunks }).length > WIKI_SOURCE_RESULT_MAX_CHARS - 200) {
        const last = chunks.reduce<(typeof chunks)[number] | undefined>(
          (largest, chunk) => (!largest || chunk.text.length > largest.text.length ? chunk : largest),
          undefined,
        );
        if (!last || last.text.length < 2)
          return sourceFailure({ error: "Source chunk cannot fit safely. Nothing was marked read." });
        last.text = last.text.slice(0, Math.floor(last.text.length / 2));
        last.nextOffset = last.offset + last.text.length;
      }
      await repo.advanceSourceReads(
        crawlId,
        chunks
          .filter(({ text }) => text.length > 0)
          .map(({ id, offset, text }) => ({ id, offset, end: offset + text.length })),
      );
      const after = await wikiSourceCoverage(repo, crawlId);
      return toonResult({
        items: chunks,
        remainingSources: after.pending.length,
        importedSources: after.imported.size,
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

export function createWikiFromCrawlTool(_locale: string | undefined, crawlId: string) {
  return {
    name: "manage_wiki_pages",
    title: "Create Knowledge Base pages from the website",
    description:
      "Create one to five Knowledge Base pages per call from stored website pages. kind knowledge summarises facts; guide is the one Operating Guide; procedure has whenToUse and numbered steps. Cite sourceIds; the server adds the Sources list with fetch dates and the gaps list. Pages are immediately available to Mate and connected AI tools.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: WikiCrawlSynthesisCreateSchema,
    outputSchema: ManageWikiPagesOutputSchema,
    execute: async (params: z.infer<typeof WikiCrawlSynthesisCreateSchema>) => {
      const parsed = WikiCrawlSynthesisCreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const repo = getWikiWebsiteCrawlRepo();
      const crawl = await repo.getCrawl(crawlId);
      if (!crawl) {
        return sourceFailure({
          error: "This website import is no longer available. Nothing was changed.",
        });
      }
      const targetLocale = appLocaleOrDefault(crawl.locale);
      if (crawl.mode === "extend" && parsed.data.pages.some((page) => page.kind !== "knowledge")) {
        return sourceFailure({
          error: "A help-centre extension creates knowledge pages only; existing guides and procedures stay unchanged.",
        });
      }
      const wrongLanguage = parsed.data.pages.some((page) => {
        const bodies = page.sections.map(({ content }) => content);
        return [
          ...bodies,
          page.whenToUse ?? "",
          page.sections.map(({ heading }) => heading).join("\n"),
          [page.title, page.whenToUse, ...bodies].join("\n"),
          (page.gaps ?? []).join("\n"),
        ].some((body) => wikiLanguageConflicts(body, targetLocale));
      });
      if (wrongLanguage) {
        return sourceFailure({
          error: `Write every page in ${targetLocale}. Translate the source content into that language. Nothing was changed.`,
        });
      }
      const created = await repo.countSynthesizedPages(crawl.startedAt);
      const createdPageTitles = await repo.listSynthesizedPageTitles(crawl.startedAt, WIKI_SYNTHESIS_MAX_PAGES);
      if (created + parsed.data.pages.length > WIKI_SYNTHESIS_MAX_PAGES) {
        return sourceFailure({
          error: `This import may create at most ${WIKI_SYNTHESIS_MAX_PAGES} summary pages; ${created} exist. Nothing was changed.`,
          createdPageTitles,
        });
      }
      const coverage = await wikiSourceCoverage(repo, crawlId);
      const sources = new Map(coverage.sources.map((source) => [source.id, source]));
      const unknown = parsed.data.pages.flatMap(({ sourceIds }) => sourceIds).filter((id) => !sources.has(id));
      if (unknown.length > 0) {
        return sourceFailure({
          error: "Cite only ids returned by read_website_source. Nothing was changed.",
        });
      }
      if (coverage.pending.length > 0) {
        return sourceFailure({
          error:
            "Read all remaining stored evidence with read_website_source action=next before creating pages. Nothing was changed.",
          remainingSources: coverage.pending.length,
          next: coverage.pending.slice(0, 4).map(({ id, readOffset }) => ({ id, offset: readOffset })),
        });
      }
      const unread = [
        ...new Set(
          parsed.data.pages
            .flatMap(({ sourceIds }) => sourceIds)
            .filter((id) => !coverage.readHashes.has(sources.get(id)?.contentHash ?? "")),
        ),
      ];
      if (unread.length > 0) {
        return sourceFailure({
          error: `Read each cited source completely with read_website_source before citing it; unread: ${unread.join(", ")}. Nothing was changed.`,
        });
      }
      const t = await getTranslator(targetLocale, "WikiSetup.generated");
      const pages = parsed.data.pages.map((page) => ({
        title: page.title,
        kind: page.kind,
        whenToUse: page.kind === "procedure" ? page.whenToUse : undefined,
        markdown: [
          ...page.sections.map(({ heading, content }) => `## ${heading}\n\n${wikiSynthesisSectionMarkdown(content)}`),
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
        toonResult({
          items: formatDatesInResponse(createdPages.map(wikiPageSummary)),
          createdPageTitles: [...createdPageTitles, ...createdPages.map(({ title }) => title)],
          remainingPageSlots: Math.max(0, WIKI_SYNTHESIS_MAX_PAGES - created - createdPages.length),
        }),
      );
    },
  };
}
