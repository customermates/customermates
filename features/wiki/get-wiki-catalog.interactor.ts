import type { GetWikiCatalogRepo } from "./get-wiki-catalog.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiCatalog, WikiCatalogInput, WikiPageDto } from "./wiki.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";

import { wikiExcerpt, wikiLeadingSlice } from "./wiki-content";
import { wikiPageUrl } from "./wiki-links";
import {
  WIKI_CATALOG_PAGE_SIZE,
  WIKI_GUIDE_CONTEXT_MAX_BYTES,
  WIKI_PROCEDURE_INDEX_SIZE,
  WikiCatalogInputSchema,
  WikiCatalogSchema,
} from "./wiki.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class GetWikiCatalogInteractor extends AuthenticatedInteractor<WikiCatalogInput, WikiCatalog> {
  constructor(private repo: GetWikiCatalogRepo) {
    super();
  }

  @Validate(WikiCatalogInputSchema)
  @ValidateOutput(WikiCatalogSchema)
  async invoke(data: WikiCatalogInput): Validated<WikiCatalog> {
    const [{ items, total }, operating] = await Promise.all([
      this.repo.listCatalogPages(data),
      data.page === 1 ? this.repo.loadOperatingPages(WIKI_PROCEDURE_INDEX_SIZE) : null,
    ]);
    const nextPage = data.page * WIKI_CATALOG_PAGE_SIZE < total ? data.page + 1 : null;
    return {
      ok: true as const,
      data: {
        ...(operating
          ? {
              guide: operating.guide ? this.guide(operating.guide) : null,
              procedures: {
                items: operating.procedures.map(({ id, title, whenToUse }) => ({
                  id,
                  title,
                  url: wikiPageUrl(env.BASE_URL, id),
                  whenToUse: whenToUse ?? "",
                })),
                total: operating.proceduresTotal,
                truncated: operating.proceduresTotal > operating.procedures.length,
              },
            }
          : {}),
        items: items.map(({ id, title, markdown, createdAt, updatedAt }) => ({
          id,
          title,
          createdAt,
          updatedAt,
          excerpt: wikiExcerpt(markdown),
          url: wikiPageUrl(env.BASE_URL, id),
        })),
        total,
        page: data.page,
        nextPage,
        truncated: nextPage !== null,
      },
    };
  }

  private guide(page: WikiPageDto) {
    const markdown = wikiLeadingSlice(page.markdown, WIKI_GUIDE_CONTEXT_MAX_BYTES);
    return {
      id: page.id,
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, page.id),
      markdown,
      nextOffset: markdown.length < page.markdown.length ? markdown.length : null,
    };
  }
}
