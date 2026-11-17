import type { Validated } from "@/core/validation/validation.utils";
import type { WikiGraphRepo } from "./wiki-graph.repo";
import type { GetWikiLinkReportData, WikiLinkReport } from "./wiki-graph.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { syncWikiLinksBestEffort, WIKI_LINK_SYNC_MAX_BATCHES } from "./get-wiki-graph.interactor";
import { GetWikiLinkReportSchema, WIKI_LINK_REPORT_LIMIT, WikiLinkReportSchema } from "./wiki-graph.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class GetWikiLinkReportInteractor extends AuthenticatedInteractor<GetWikiLinkReportData, WikiLinkReport> {
  constructor(private repo: WikiGraphRepo) {
    super();
  }

  @Validate(GetWikiLinkReportSchema)
  @ValidateOutput(WikiLinkReportSchema)
  async invoke(_data: GetWikiLinkReportData): Validated<WikiLinkReport> {
    const syncing = await syncWikiLinksBestEffort(this.repo, WIKI_LINK_SYNC_MAX_BATCHES);
    const [pages, links] = await Promise.all([this.repo.loadGraphPages(), this.repo.loadLinks()]);
    const live = new Set(pages.map((page) => page.id));
    const linkedTo = new Set<string>();
    const missing = new Map<string, string[]>();
    for (const link of links) {
      if (link.targetKind !== "page" || !live.has(link.pageId)) continue;
      if (live.has(link.targetId)) linkedTo.add(link.targetId);
      else missing.set(link.pageId, [...(missing.get(link.pageId) ?? []), link.targetId]);
    }
    const summary = (page: (typeof pages)[number]) => ({ id: page.id, title: page.title, kind: page.kind });
    const orphans = pages.filter((page) => page.kind !== "guide" && !linkedTo.has(page.id));
    const broken = pages.filter((page) => missing.has(page.id));
    return {
      ok: true as const,
      data: {
        pages: pages.length,
        orphans: orphans.slice(0, WIKI_LINK_REPORT_LIMIT).map(summary),
        orphansTotal: orphans.length,
        broken: broken
          .slice(0, WIKI_LINK_REPORT_LIMIT)
          .map((page) => ({ ...summary(page), missingPageIds: missing.get(page.id) ?? [] })),
        brokenTotal: broken.length,
        syncing,
      },
    };
  }
}
