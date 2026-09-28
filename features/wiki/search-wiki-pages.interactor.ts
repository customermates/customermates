import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageDto, WikiPageSearchData, WikiPageSearchResult, WikiSearchResult } from "./wiki.schema";
import type { WikiKeywordCandidate, WikiSemanticCandidate } from "./wiki-hybrid-ranking";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";

import { externalizeWikiPageLinks } from "./wiki-markdown-links";
import { parseWikiSearchQuery, wikiSearchMatch, wikiSectionOffsetIn } from "./wiki-search";
import { fuseWikiSearchCandidates, WIKI_SEMANTIC_CANDIDATES } from "./wiki-hybrid-ranking";
import { WikiPageSearchResultSchema, WikiPageSearchSchema } from "./wiki.schema";

export type WikiSearchHit = WikiSearchResult & { markdown: string };

export abstract class SearchWikiPagesRepo {
  abstract searchPages(
    data: WikiPageSearchData,
  ): Promise<Omit<WikiPageSearchResult, "items"> & { items: WikiSearchHit[] }>;
  abstract searchPageCandidates(query: string, limit: number): Promise<WikiKeywordCandidate[]>;
  abstract semanticPageCandidates(
    vector: number[],
    model: string,
    limit: number,
  ): Promise<{ candidates: WikiSemanticCandidate[]; stalePageIds: Set<string> } | null>;
  abstract getPagesByIds(ids: string[]): Promise<WikiPageDto[]>;
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
    const semantic = await this.semanticSearch(data);
    if (semantic) return { ok: true as const, data: semantic };

    const { items, ...result } = await this.repo.searchPages(data);
    return {
      ok: true as const,
      data: {
        ...result,
        items: items.map((item) => this.searchResult(item)),
        ...(this.semantic ? { retrieval: "keyword" as const } : {}),
      },
    };
  }

  private async semanticSearch(data: WikiPageSearchData): Promise<WikiPageSearchResult | null> {
    if (!this.semantic) return null;
    const embedding = await this.semantic.embedder.embedQuery(data.query);
    if (!embedding) return null;

    const window = data.page * data.pageSize;
    const [semantic, keyword] = await Promise.all([
      this.repo.semanticPageCandidates(embedding.vector, embedding.model, WIKI_SEMANTIC_CANDIDATES),
      this.repo.searchPageCandidates(data.query, Math.max(WIKI_SEMANTIC_CANDIDATES, window)),
    ]);
    if (!semantic) return null;
    if (semantic.stalePageIds.size > 0) await this.semantic.scheduler.schedule();

    const ranked = fuseWikiSearchCandidates(semantic.candidates, keyword, semantic.stalePageIds);
    const selected = ranked.slice((data.page - 1) * data.pageSize, window);
    const pages = new Map((await this.repo.getPagesByIds(selected.map(({ id }) => id))).map((page) => [page.id, page]));
    const query = parseWikiSearchQuery(data.query);
    const items = selected.flatMap(({ id, offset }) => {
      const page = pages.get(id);
      if (!page) return [];
      return [this.searchResult({ ...page, ...wikiSearchMatch(page.markdown, query, offset) })];
    });
    return { items, total: ranked.length, page: data.page, pageSize: data.pageSize, retrieval: "semantic" };
  }

  private searchResult({ markdown, ...item }: WikiSearchHit): WikiSearchResult {
    if (this.offsets === "stored" || !item.offset) return item;
    return {
      ...item,
      offset: wikiSectionOffsetIn(markdown, item.offset, externalizeWikiPageLinks(markdown, env.BASE_URL)),
    };
  }
}
