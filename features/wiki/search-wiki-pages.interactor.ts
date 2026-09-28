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
import { fuseFullTextAndSemantic, rerankSections, RetrievalStopwatch } from "@/core/retrieval/retrieval-pipeline";

import { externalizeWikiPageLinks } from "./wiki-markdown-links";
import { wikiSectionLocation, wikiSectionPlainText, wikiSectionTexts, wikiSnippet } from "./wiki-section-location";
import { wikiSectionOffsetIn } from "./wiki-markdown-sections";
import { WikiPageSearchResultSchema, WikiPageSearchSchema } from "./wiki.schema";

export type WikiSearchHit = WikiSearchResult & { markdown: string };

const WIKI_RERANK_CANDIDATES = 10;
const WIKI_SEMANTIC_CANDIDATES = 30;

export type WikiSemanticCandidate = { id: string; offset: number; similarity: number };
export type WikiFullTextCandidates = { keys: string[]; pinned: string[]; corrected?: string };

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
  abstract embedQuery(query: string): Promise<{ vector: number[]; model: string } | null>;
}

export abstract class WikiSemanticIndexScheduler {
  abstract schedule(): Promise<void>;
}

export type WikiSemanticRetrieval = { embedder: WikiQueryEmbedder; scheduler: WikiSemanticIndexScheduler };

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class SearchWikiPagesInteractor extends AuthenticatedInteractor<WikiPageSearchData, WikiPageSearchResult> {
  constructor(
    private repo: SearchWikiPagesRepo,
    private offsets: "stored" | "externalized",
    private semantic: WikiSemanticRetrieval | null = null,
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
      const semantic = this.semantic && env.APP_MODE !== "demo" ? this.semantic : null;
      const offsets = new Map<string, number>();
      let stalePageIds = new Set<string>();
      let corrected: string | undefined;
      const fused = await fuseFullTextAndSemantic({
        query: data.query,
        stopwatch,
        fullText: async () => {
          const found = await this.repo.fullTextPageCandidates(data.query, Math.max(WIKI_SEMANTIC_CANDIDATES, window));
          corrected = found.corrected;
          return found;
        },
        embed: semantic ? (query) => semantic.embedder.embedQuery(query) : null,
        semantic: async ({ vector, model }) => {
          const found = await this.repo.semanticPageCandidates(vector, model, WIKI_SEMANTIC_CANDIDATES);
          if (!found) return null;
          stalePageIds = found.stalePageIds;
          for (const candidate of found.candidates) offsets.set(candidate.id, candidate.offset);
          return found.candidates.map(({ id }) => id);
        },
      });
      if (semantic && stalePageIds.size > 0) await semantic.scheduler.schedule();

      const head = fused.ranked.slice(0, Math.max(window, data.page === 1 ? WIKI_RERANK_CANDIDATES : 0));
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
      const order = data.page === 1 ? await rerankSections({ query: data.query, stopwatch, candidates, ranker }) : null;
      const reordered = order
        ? [...order.map((id) => located[id]), ...located.filter((_, index) => !order.includes(index))]
        : located;
      const selected = reordered.slice((data.page - 1) * data.pageSize, window);
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
        total: fused.ranked.length,
        page: data.page,
        pageSize: data.pageSize,
        ...(corrected ? { didYouMean: [corrected] } : {}),
        ...(this.semantic ? { retrieval: fused.vector ? ("semantic" as const) : ("keyword" as const) } : {}),
      };
    } finally {
      stopwatch.finish();
    }
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
