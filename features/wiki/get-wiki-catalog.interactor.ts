import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import type { Validated } from "@/core/validation/validation.utils";
import { env } from "@/env";

import { wikiExcerpt, wikiRelevantMarkdownPreview, wikiRelevantSearchSnippet } from "./wiki-content";
import { wikiPageUrl } from "./wiki-links";
import {
  WIKI_CATALOG_PAGE_SIZE,
  WikiCatalogInputSchema,
  WikiCatalogSchema,
  type WikiCatalog,
  type WikiCatalogInput,
  type WikiPageDto,
} from "./wiki.schema";

export abstract class GetWikiCatalogRepo {
  abstract listCatalogPages(data: WikiCatalogInput): Promise<{ items: WikiPageDto[]; total: number }>;
  abstract findRelevantCatalogPages(data: { query: string }): Promise<WikiPageDto[]>;
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
    const [{ items, total }, relevantPages] = await Promise.all([
      this.repo.listCatalogPages(data),
      data.query?.trim() ? this.repo.findRelevantCatalogPages({ query: data.query }) : Promise.resolve([]),
    ]);
    const nextPage = data.page * WIKI_CATALOG_PAGE_SIZE < total ? data.page + 1 : null;
    return {
      ok: true,
      data: {
        items: items.map(({ markdown, ...page }) => ({
          ...page,
          excerpt: wikiExcerpt(markdown),
          url: wikiPageUrl(env.BASE_URL, page.id),
        })),
        relevantPages: relevantPages.map(({ markdown, ...page }) => ({
          ...page,
          excerpt: wikiRelevantSearchSnippet(markdown, data.query ?? ""),
          url: wikiPageUrl(env.BASE_URL, page.id),
          ...wikiRelevantMarkdownPreview(markdown, data.query ?? "", env.BASE_URL),
        })),
        total,
        page: data.page,
        nextPage,
        truncated: nextPage !== null,
      },
    };
  }
}
