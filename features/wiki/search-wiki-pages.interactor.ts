import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageSearchData, WikiPageSearchResult, WikiSearchResult } from "./wiki.schema";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";

import { externalizeWikiPageLinks } from "./wiki-markdown-links";
import { wikiSectionOffsetIn } from "./wiki-search";
import { WikiPageSearchResultSchema, WikiPageSearchSchema } from "./wiki.schema";

export type WikiSearchHit = WikiSearchResult & { markdown: string };

export abstract class SearchWikiPagesRepo {
  abstract searchPages(
    data: WikiPageSearchData,
  ): Promise<Omit<WikiPageSearchResult, "items"> & { items: WikiSearchHit[] }>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class SearchWikiPagesInteractor extends AuthenticatedInteractor<WikiPageSearchData, WikiPageSearchResult> {
  constructor(
    private repo: SearchWikiPagesRepo,
    private offsets: "stored" | "externalized",
  ) {
    super();
  }

  @Validate(WikiPageSearchSchema)
  @ValidateOutput(WikiPageSearchResultSchema)
  async invoke(data: WikiPageSearchData): Validated<WikiPageSearchResult> {
    const { items, ...result } = await this.repo.searchPages(data);
    return { ok: true as const, data: { ...result, items: items.map((item) => this.searchResult(item)) } };
  }

  private searchResult({ markdown, ...item }: WikiSearchHit): WikiSearchResult {
    if (this.offsets === "stored" || !item.offset) return item;
    return {
      ...item,
      offset: wikiSectionOffsetIn(markdown, item.offset, externalizeWikiPageLinks(markdown, env.BASE_URL)),
    };
  }
}
