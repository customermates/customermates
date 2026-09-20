import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import type { Validated } from "@/core/validation/validation.utils";
import { env } from "@/env";

import { wikiExcerpt } from "./wiki-content";
import { wikiMarkdownChunk, WIKI_AGENTS_CONTEXT_MAX_CHARS } from "./wiki-page-chunk";
import {
  WIKI_CATALOG_PAGE_SIZE,
  WikiCatalogInputSchema,
  WikiCatalogSchema,
  type WikiCatalog,
  type WikiCatalogInput,
  type WikiPageDto,
} from "./wiki.schema";

export abstract class GetWikiCatalogRepo {
  abstract listCatalogPages(
    data: WikiCatalogInput,
  ): Promise<{ items: WikiPageDto[]; agentsMd: WikiPageDto | null; total: number }>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class GetWikiCatalogInteractor extends AuthenticatedInteractor<WikiCatalogInput, WikiCatalog> {
  constructor(private repo: GetWikiCatalogRepo) {
    super();
  }

  @Validate(WikiCatalogInputSchema)
  @ValidateOutput(WikiCatalogSchema)
  async invoke(data: WikiCatalogInput): Validated<WikiCatalog> {
    const { items, agentsMd, total } = await this.repo.listCatalogPages(data);
    const nextPage = data.page * WIKI_CATALOG_PAGE_SIZE < total ? data.page + 1 : null;
    const agentsChunk = agentsMd ? wikiMarkdownChunk(agentsMd.markdown, 0, WIKI_AGENTS_CONTEXT_MAX_CHARS) : null;
    return {
      ok: true,
      data: {
        items: items.map(({ markdown, ...page }) => ({
          ...page,
          excerpt: wikiExcerpt(markdown),
          url: `${env.BASE_URL}/wiki?page=${page.id}`,
        })),
        agentsMd: agentsMd
          ? {
              id: agentsMd.id,
              title: agentsMd.title,
              createdAt: agentsMd.createdAt,
              updatedAt: agentsMd.updatedAt,
              url: `${env.BASE_URL}/wiki?page=${agentsMd.id}`,
              markdownChunk: agentsChunk?.markdownChunk ?? "",
              offset: 0,
              nextOffset: agentsChunk?.nextOffset ?? null,
              totalChars: agentsChunk?.totalChars ?? 0,
            }
          : null,
        total,
        page: data.page,
        nextPage,
        truncated: nextPage !== null,
      },
    };
  }
}
