import { WikiSearchOrders } from "./wiki-search-orders";
import type { SearchWikiPagesRepo, WikiSectionHit, WikiSectionSync } from "./search-wiki-pages.repo";
import type { WikiQueryEmbedder } from "./wiki-query-embedder";
import type { WikiSemanticIndexScheduler } from "./wiki-semantic-index-scheduler";
import type { WikiKnowledgeGapRecorder } from "./wiki-knowledge-gap-recorder";
import type { QueryVector, RelevanceFloor } from "@/core/retrieval/retrieval-pipeline";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageDto, WikiPageSearchData, WikiPageSearchResult, WikiSearchResult } from "./wiki.schema";

import * as Sentry from "@sentry/node";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";

import { currentSectionRanker } from "@/core/retrieval/retrieval-context";
import { retrievalExcerpt } from "@/core/retrieval/retrieval-excerpt";
import { fuseFullTextAndSemantic, keepsResults, rerankSections } from "@/core/retrieval/retrieval-pipeline";
import { RetrievalStopwatch } from "@/core/retrieval/retrieval-stopwatch";

import { externalizeWikiPageLinks } from "./wiki-markdown-links";
import { wikiSectionOffsetIn } from "./wiki-markdown-sections";
import { WIKI_EXCERPT_MAX_LENGTH, wikiExcerpt } from "./wiki-content";
import { wikiCodePointBoundary } from "./wiki-page-chunk";
import { WikiPageSearchResultSchema, WikiPageSearchSchema } from "./wiki.schema";

const WIKI_RERANK_CANDIDATES = 10;
const WIKI_SEMANTIC_CANDIDATES = 30;
const WIKI_SEARCH_ORDER_TTL_MS = 5 * 60 * 1000;
const WIKI_SECTION_LABEL_MAX_LENGTH = 160;
export const WIKI_SEARCH_ORDER_LIMIT = 500;

export type WikiSearchOrder = {
  ids: string[];
  sections: Map<string, string>;
  exhaustive: boolean;
  semantic: boolean;
  abstained: boolean;
  incomplete: boolean;
  vector: QueryVector | null;
  corrected?: string;
  expiresAt: number;
};

export const sharedWikiSearchOrders = new WikiSearchOrders();

export type WikiSemanticRetrieval = {
  embedder: WikiQueryEmbedder;
  scheduler: WikiSemanticIndexScheduler;
  gaps?: WikiKnowledgeGapRecorder;
  relevanceFloor?: RelevanceFloor | null;
};

function boundedLabel(value: string): string {
  if (value.length <= WIKI_SECTION_LABEL_MAX_LENGTH) return value;
  return `${value.slice(0, wikiCodePointBoundary(value, WIKI_SECTION_LABEL_MAX_LENGTH - 1)).trimEnd()}…`;
}

export function wikiSectionSnippet(text: string, query: string): string {
  const excerpt = retrievalExcerpt({
    heading: "",
    markdown: text,
    query,
    maxChars: WIKI_EXCERPT_MAX_LENGTH,
  });
  const compact = excerpt.replace(/\s+/gu, " ").trim();
  return compact || (text ? wikiExcerpt(text) : "");
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class SearchWikiPagesInteractor extends AuthenticatedInteractor<WikiPageSearchData, WikiPageSearchResult> {
  constructor(
    private repo: SearchWikiPagesRepo,
    private offsets: "stored" | "externalized",
    private semantic: WikiSemanticRetrieval | null = null,
    private orders: WikiSearchOrders = new WikiSearchOrders(),
  ) {
    super();
  }

  @Validate(WikiPageSearchSchema)
  @ValidateOutput(WikiPageSearchResultSchema)
  async invoke(data: WikiPageSearchData): Validated<WikiPageSearchResult> {
    return { ok: true as const, data: await this.search(data) };
  }

  private async search(data: WikiPageSearchData): Promise<WikiPageSearchResult> {
    const stopwatch = new RetrievalStopwatch("wiki");
    try {
      const window = data.page * data.pageSize;
      const pageStart = (data.page - 1) * data.pageSize;
      const semantic = this.semantic && env.APP_MODE !== "demo" ? this.semantic : null;
      const key = [this.companyId, this.userId, semantic ? "semantic" : "keyword", data.query].join("\u0000");
      const previous = data.page > 1 ? this.orders.get(key, Date.now()) : undefined;
      const order =
        previous && (previous.exhaustive || previous.ids.length > window)
          ? previous
          : await this.rankOrder(data, {
              window,
              pageStart,
              semantic,
              stopwatch,
              previous,
            });
      if (order !== previous) this.orders.set(key, order);
      if (!previous && order.abstained && semantic?.gaps) await semantic.gaps.record(data.query);

      const matchedText = order.corrected ?? data.query;
      const selectedIds = order.ids.slice(pageStart, window);
      const [pages, sections] = await Promise.all([
        this.repo.getPagesByIds(selectedIds),
        this.repo.getSectionsByIds(selectedIds.flatMap((id) => order.sections.get(id) ?? [])),
      ]);
      const pageById = new Map(pages.map((page) => [page.id, page]));
      const sectionById = new Map(sections.map((section) => [section.id, section]));
      const items = selectedIds.flatMap((id) => {
        const page = pageById.get(id);
        if (!page) return [];
        const sectionId = order.sections.get(id);
        return [this.searchResult(page, sectionId ? sectionById.get(sectionId) : undefined, matchedText)];
      });
      return {
        items,
        total: order.ids.length,
        totalIsExact: order.exhaustive && !order.incomplete,
        hasMore: order.ids.length > window || !order.exhaustive,
        page: data.page,
        pageSize: data.pageSize,
        ...(order.corrected ? { didYouMean: [order.corrected] } : {}),
        ...(this.semantic
          ? {
              retrieval: order.semantic ? ("semantic" as const) : ("keyword" as const),
            }
          : {}),
        ...(order.abstained ? { abstained: true } : {}),
        ...(order.incomplete ? { incomplete: true } : {}),
      };
    } finally {
      stopwatch.finish();
    }
  }

  private async rankOrder(
    data: WikiPageSearchData,
    args: {
      window: number;
      pageStart: number;
      semantic: WikiSemanticRetrieval | null;
      stopwatch: RetrievalStopwatch;
      previous: WikiSearchOrder | undefined;
    },
  ): Promise<WikiSearchOrder> {
    const { window, pageStart, semantic, stopwatch, previous } = args;
    const sync = await this.syncStaleSections();
    const sections = new Map<string, string>();
    const limit = Math.max(WIKI_SEMANTIC_CANDIDATES, window + 1);
    let fullTextCount = 0;
    let semanticCount = 0;
    let stale = false;
    let semanticHits: Array<{ pageId: string; sectionId: string }> = [];
    let corrected: string | undefined;
    const fused = await fuseFullTextAndSemantic({
      query: data.query,
      stopwatch,
      fullText: async () => {
        const found = await this.repo.fullTextSections(data.query, limit);
        corrected = found.corrected;
        fullTextCount = found.hits.length;
        for (const hit of [...found.pinned, ...found.hits])
          if (!sections.has(hit.pageId)) sections.set(hit.pageId, hit.sectionId);

        return {
          keys: found.hits.map(({ pageId }) => pageId),
          pinned: found.pinned.map(({ pageId }) => pageId),
          coverage: found.coverage,
        };
      },
      embed: semantic
        ? previous
          ? () => Promise.resolve(previous.vector)
          : (query, wait) => semantic.embedder.embedQuery(query, wait)
        : null,
      semantic: async ({ vector, version }) => {
        const found = await this.repo.semanticSections(vector, version, limit);
        if (!found) return null;
        semanticCount = found.hits.length;
        stale = found.stale;
        semanticHits = found.hits;
        return {
          keys: found.hits.map(({ pageId }) => pageId),
          similarity: found.complete ? Math.max(0, ...found.hits.map(({ similarity }) => similarity)) : null,
        };
      },
      relevanceFloor: semantic?.relevanceFloor,
    });
    if (fused.semantic) for (const hit of semanticHits) sections.set(hit.pageId, hit.sectionId);
    if (semantic && (stale || sync.remaining)) await semantic.scheduler.schedule();

    const reranks = pageStart < WIKI_RERANK_CANDIDATES && pageStart < fused.ranked.length;
    const head = fused.ranked.slice(0, WIKI_RERANK_CANDIDATES);
    const ranking = reranks ? await this.rerank(data.query, head, sections, stopwatch, fused.relevance) : null;
    const kept = keepsResults(fused.relevance, ranking);
    const chosen = ranking?.order ?? [];
    const ids = kept ? [...new Set([...chosen.flatMap((index) => head[index] ?? []), ...fused.ranked])] : [];
    const order: WikiSearchOrder = {
      ids,
      sections,
      exhaustive: !kept || (fullTextCount < limit && semanticCount < limit),
      semantic: fused.vector !== null,
      abstained: ids.length === 0 && !sync.remaining,
      incomplete: sync.remaining,
      vector: fused.vector,
      ...(corrected ? { corrected } : {}),
      expiresAt: Date.now() + WIKI_SEARCH_ORDER_TTL_MS,
    };
    if (!previous) return order;
    const seen = new Set(previous.ids);
    return {
      ...previous,
      ids: [...previous.ids, ...order.ids.filter((id) => !seen.has(id))],
      sections: new Map([...order.sections, ...previous.sections]),
      exhaustive: order.exhaustive,
      incomplete: order.incomplete,
      expiresAt: order.expiresAt,
    };
  }

  private async syncStaleSections(): Promise<WikiSectionSync> {
    try {
      return await this.repo.syncStaleSectionsUnlessBusy();
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "wiki-section-search-sync", companyId: this.companyId } });
      return { synced: 0, remaining: true };
    }
  }

  private async rerank(
    query: string,
    head: readonly string[],
    sections: ReadonlyMap<string, string>,
    stopwatch: RetrievalStopwatch,
    relevance: Parameters<typeof rerankSections>[0]["relevance"],
  ) {
    const ranker = env.APP_MODE === "demo" ? undefined : currentSectionRanker("wiki");
    const [pages, rows] = await Promise.all([
      this.repo.getPagesByIds([...head]),
      this.repo.getSectionsByIds(head.flatMap((id) => sections.get(id) ?? [])),
    ]);
    const titles = new Map(pages.map((page) => [page.id, page.title]));
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const candidates = head.flatMap((pageId, id) => {
      const sectionId = sections.get(pageId);
      const row = sectionId ? rowById.get(sectionId) : undefined;
      const pageTitle = titles.get(pageId);
      return row && pageTitle !== undefined
        ? [
            {
              id,
              section: {
                pageTitle,
                headingPath: row.headingPath,
                text: row.text,
              },
            },
          ]
        : [];
    });
    return rerankSections({ query, stopwatch, candidates, ranker, relevance });
  }

  private searchResult(page: WikiPageDto, section: WikiSectionHit | undefined, query: string): WikiSearchResult {
    const { markdown, ...item } = page;
    const offset = section?.offset ?? 0;
    const located = {
      ...item,
      snippet: section ? wikiSectionSnippet(section.text, query) : wikiExcerpt(markdown),
      offset,
      ...(section && section.headingPath.length > 0
        ? {
            section: boundedLabel(section.headingPath.join(" > ")),
            ...(section.anchor ? { anchor: section.anchor } : {}),
          }
        : {}),
    };
    if (this.offsets === "stored" || !offset) return located;
    return {
      ...located,
      offset: wikiSectionOffsetIn(markdown, offset, externalizeWikiPageLinks(markdown, env.BASE_URL)),
    };
  }
}
