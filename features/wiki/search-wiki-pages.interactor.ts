import type { QueryEmbeddingWait, RelevanceFloor } from "@/core/retrieval/retrieval-pipeline";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageDto, WikiPageSearchData, WikiPageSearchResult, WikiSearchResult } from "./wiki.schema";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";

import { currentSectionRanker } from "@/core/retrieval/retrieval-context";
import {
  fuseFullTextAndSemantic,
  keepsResults,
  rerankSections,
  RetrievalStopwatch,
} from "@/core/retrieval/retrieval-pipeline";

import { externalizeWikiPageLinks } from "./wiki-markdown-links";
import { wikiSectionLocation, wikiSectionPlainText, wikiSectionTexts, wikiSnippet } from "./wiki-section-location";
import { wikiSectionOffsetIn } from "./wiki-markdown-sections";
import { WikiPageSearchResultSchema, WikiPageSearchSchema } from "./wiki.schema";

export type WikiSearchHit = WikiSearchResult & { markdown: string };

const WIKI_RERANK_CANDIDATES = 10;
const WIKI_SEMANTIC_CANDIDATES = 30;
const WIKI_SEARCH_ORDER_TTL_MS = 5 * 60 * 1000;
const WIKI_SEARCH_ORDER_LIMIT = 500;

type WikiSearchOrder = {
  ids: string[];
  offsets: Map<string, number>;
  exhaustive: boolean;
  semantic: boolean;
  corrected?: string;
  expiresAt: number;
};

type LocatedWikiSection = Awaited<ReturnType<SearchWikiPagesInteractor["locateSections"]>>[number];

export class WikiSearchOrders {
  private orders = new Map<string, WikiSearchOrder>();

  get(key: string, now: number): WikiSearchOrder | undefined {
    const order = this.orders.get(key);
    if (!order) return undefined;
    this.orders.delete(key);
    if (order.expiresAt <= now) return undefined;
    this.orders.set(key, order);
    return order;
  }

  set(key: string, order: WikiSearchOrder) {
    this.orders.delete(key);
    this.orders.set(key, order);
    const oldest = this.orders.keys().next().value;
    if (this.orders.size > WIKI_SEARCH_ORDER_LIMIT && oldest !== undefined) this.orders.delete(oldest);
  }
}

export const sharedWikiSearchOrders = new WikiSearchOrders();

export type WikiSemanticCandidate = { id: string; offset: number; similarity: number };
export type WikiFullTextCandidates = { keys: string[]; pinned: string[]; coverage: number; corrected?: string };

export abstract class SearchWikiPagesRepo {
  abstract semanticPageCandidates(
    vector: number[],
    model: string,
    limit: number,
  ): Promise<{ candidates: WikiSemanticCandidate[]; stalePageIds: Set<string> } | null>;
  abstract getPagesByIds(ids: string[]): Promise<WikiPageDto[]>;
  abstract fullTextPageCandidates(query: string, limit: number): Promise<WikiFullTextCandidates>;
  abstract rankPageSections(
    query: string,
    sections: Array<{ key: number; heading: string; body: string }>,
  ): Promise<Map<number, number>>;
  abstract sectionHeadlines(query: string, bodies: string[]): Promise<string[]>;
}

export abstract class WikiQueryEmbedder {
  abstract embedQuery(query: string, wait?: QueryEmbeddingWait): Promise<{ vector: number[]; model: string } | null>;
}

export abstract class WikiSemanticIndexScheduler {
  abstract schedule(): Promise<void>;
}

export type WikiSemanticRetrieval = {
  embedder: WikiQueryEmbedder;
  scheduler: WikiSemanticIndexScheduler;
  relevanceFloor?: RelevanceFloor | null;
};

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
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
      const ranked =
        previous && (previous.exhaustive || previous.ids.length >= window)
          ? { order: previous, located: new Map<string, LocatedWikiSection>() }
          : await this.rankOrder(data, { window, pageStart, semantic, stopwatch, previous });
      const { order } = ranked;
      if (order !== previous) this.orders.set(key, order);

      const matchedText = order.corrected ?? data.query;
      const selectedIds = order.ids.slice(pageStart, window);
      const unlocated = selectedIds.filter((id) => !ranked.located.has(id));
      const pages = new Map((await this.repo.getPagesByIds(unlocated)).map((page) => [page.id, page]));
      const fresh = await this.locateSections(
        matchedText,
        unlocated.flatMap((id) => pages.get(id) ?? []),
        order.offsets,
      );
      const located = new Map([...ranked.located, ...fresh.map((entry) => [entry.page.id, entry] as const)]);
      const selected = selectedIds.flatMap((id) => located.get(id) ?? []);
      const headlines = await this.repo.sectionHeadlines(
        matchedText,
        selected.map((entry) => entry.plainText()),
      );
      const items = selected.map((entry, index) =>
        this.searchResult({
          ...entry.page,
          snippet: wikiSnippet(headlines[index] ?? ""),
          ...wikiSectionLocation(entry.page.markdown, entry.offset),
        }),
      );
      return {
        items,
        total: order.ids.length,
        page: data.page,
        pageSize: data.pageSize,
        ...(order.corrected ? { didYouMean: [order.corrected] } : {}),
        ...(this.semantic ? { retrieval: order.semantic ? ("semantic" as const) : ("keyword" as const) } : {}),
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
  ): Promise<{ order: WikiSearchOrder; located: Map<string, LocatedWikiSection> }> {
    const { window, pageStart, semantic, stopwatch, previous } = args;
    const offsets = new Map<string, number>();
    const fullTextLimit = Math.max(WIKI_SEMANTIC_CANDIDATES, window);
    let fullTextCount = 0;
    let stalePageIds = new Set<string>();
    let corrected: string | undefined;
    const fused = await fuseFullTextAndSemantic({
      query: data.query,
      stopwatch,
      fullText: async () => {
        const found = await this.repo.fullTextPageCandidates(data.query, fullTextLimit);
        corrected = found.corrected;
        fullTextCount = found.keys.length;
        return found;
      },
      embed: semantic ? (query, wait) => semantic.embedder.embedQuery(query, wait) : null,
      semantic: async ({ vector, model }) => {
        const found = await this.repo.semanticPageCandidates(vector, model, WIKI_SEMANTIC_CANDIDATES);
        if (!found) return null;
        stalePageIds = found.stalePageIds;
        for (const candidate of found.candidates) offsets.set(candidate.id, candidate.offset);
        return {
          keys: found.candidates.map(({ id }) => id),
          similarity:
            found.stalePageIds.size > 0 ? null : Math.max(0, ...found.candidates.map(({ similarity }) => similarity)),
        };
      },
      relevanceFloor: semantic?.relevanceFloor,
    });
    if (semantic && stalePageIds.size > 0) await semantic.scheduler.schedule();

    const reranks = pageStart < WIKI_RERANK_CANDIDATES && pageStart < fused.ranked.length;
    const head = fused.ranked.slice(0, Math.max(window, reranks ? WIKI_RERANK_CANDIDATES : 0));
    const pages = new Map((await this.repo.getPagesByIds(head)).map((page) => [page.id, page]));
    const matchedText = corrected ?? data.query;
    const located = await this.locateSections(
      matchedText,
      head.flatMap((id) => pages.get(id) ?? []),
      offsets,
    );
    const ranker = env.APP_MODE === "demo" ? undefined : currentSectionRanker("wiki");
    const candidates = located.slice(0, WIKI_RERANK_CANDIDATES).map((entry, id) => ({
      id,
      section: { pageTitle: entry.page.title, headingPath: entry.headingPath, text: entry.text },
      titleOnly: false,
    }));
    const ranking = reranks ? await rerankSections({ query: data.query, stopwatch, candidates, ranker }) : null;
    const chosen = ranking?.order ?? null;
    const kept = keepsResults(fused.relevance, ranking);
    const reordered = !kept
      ? []
      : chosen
        ? [...chosen.map((id) => located[id]), ...located.filter((_, index) => !chosen.includes(index))]
        : located;
    for (const entry of reordered) offsets.set(entry.page.id, entry.offset);
    const headIds = new Set(head);
    const order: WikiSearchOrder = {
      ids: kept ? [...reordered.map((entry) => entry.page.id), ...fused.ranked.filter((id) => !headIds.has(id))] : [],
      offsets,
      exhaustive: !kept || fullTextCount < fullTextLimit,
      semantic: fused.vector !== null,
      ...(corrected ? { corrected } : {}),
      expiresAt: Date.now() + WIKI_SEARCH_ORDER_TTL_MS,
    };
    if (!previous) return { order, located: new Map(reordered.map((entry) => [entry.page.id, entry])) };

    const seen = new Set(previous.ids);
    const merged = new Map([...order.offsets, ...previous.offsets]);
    return {
      order: {
        ...previous,
        ids: [...previous.ids, ...order.ids.filter((id) => !seen.has(id))],
        offsets: merged,
        exhaustive: order.exhaustive,
        expiresAt: order.expiresAt,
      },
      located: new Map(
        reordered.filter((entry) => merged.get(entry.page.id) === entry.offset).map((entry) => [entry.page.id, entry]),
      ),
    };
  }

  private async locateSections(query: string, pages: WikiPageDto[], offsets: Map<string, number>) {
    const sectionsByPage = pages.map((page) => wikiSectionTexts(page.markdown));
    const unranked = sectionsByPage.flatMap((sections, pageIndex) =>
      offsets.has(pages[pageIndex].id)
        ? []
        : sections.map((section, sectionIndex) => ({ pageIndex, sectionIndex, section })),
    );
    const scores = await this.repo.rankPageSections(
      query,
      unranked.map(({ section }, key) => ({ key, heading: section.heading, body: section.body })),
    );
    const best = new Map<number, { index: number; score: number }>();
    unranked.forEach(({ pageIndex, sectionIndex }, key) => {
      const score = scores.get(key) ?? 0;
      const current = best.get(pageIndex);
      if (!current || score > current.score) best.set(pageIndex, { index: sectionIndex, score });
    });
    return pages.map((page, pageIndex) => {
      const sections = sectionsByPage[pageIndex];
      const preferred = offsets.get(page.id);
      const section = (preferred === undefined
        ? undefined
        : sections.find((candidate) => candidate.offset === preferred)) ??
        sections[best.get(pageIndex)?.index ?? 0] ?? { offset: 0, heading: "", body: "", markdown: "" };
      return {
        page,
        offset: section.offset,
        headingPath: section.heading ? section.heading.split(" > ") : [],
        text: section.body,
        plainText: () => wikiSectionPlainText(section),
      };
    });
  }

  private searchResult({ markdown, ...item }: WikiSearchHit): WikiSearchResult {
    if (this.offsets === "stored" || !item.offset) return item;
    return {
      ...item,
      offset: wikiSectionOffsetIn(markdown, item.offset, externalizeWikiPageLinks(markdown, env.BASE_URL)),
    };
  }
}
