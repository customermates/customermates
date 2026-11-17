import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiGraphRepo } from "./wiki-graph.repo";
import type { GetWikiPageLinksData, WikiPageLinks } from "./wiki-graph.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { syncWikiLinksBestEffort, WIKI_LINK_SYNC_MAX_BATCHES } from "./get-wiki-graph.interactor";
import { wikiGraphRecordTypes } from "./wiki-graph-records";
import { GetWikiPageLinksSchema, WikiPageLinksSchema } from "./wiki-graph.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class GetWikiPageLinksInteractor extends AuthenticatedInteractor<GetWikiPageLinksData, WikiPageLinks> {
  constructor(
    private repo: WikiGraphRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(GetWikiPageLinksSchema)
  @ValidateOutput(WikiPageLinksSchema)
  async invoke(data: GetWikiPageLinksData): Validated<WikiPageLinks> {
    const [page] = await this.repo.loadPagesByIds([data.id]);
    if (!page) return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    const syncing = await syncWikiLinksBestEffort(this.repo, WIKI_LINK_SYNC_MAX_BATCHES);

    const { outgoing, incomingPageIds } = await this.repo.loadLinksOfPage(page.id);
    const outgoingPageIds = outgoing.filter((link) => link.targetKind === "page").map((link) => link.targetId);
    const related = await this.repo.loadPagesByIds([...new Set([...incomingPageIds, ...outgoingPageIds])]);
    const incoming = new Set(incomingPageIds);
    const outgoingSet = new Set(outgoingPageIds);
    const summaries = related.map((item) => ({ id: item.id, title: item.title, kind: item.kind }));
    const linkedFrom = summaries.filter((item) => incoming.has(item.id));
    const linksTo = summaries.filter((item) => outgoingSet.has(item.id));
    const live = new Set(linksTo.map((item) => item.id));
    const missingPageIds = outgoingPageIds.filter((id) => !live.has(id));

    const counts = new Map<string, number>();
    const lists = new Set<string>();
    for (const link of outgoing) {
      if (link.targetKind === "page" || !link.targetTypeId) continue;
      if (link.targetKind === "list") lists.add(link.targetTypeId);
      else counts.set(link.targetTypeId, (counts.get(link.targetTypeId) ?? 0) + 1);
    }
    const typeIds = new Set([...counts.keys(), ...lists]);
    const records =
      typeIds.size === 0
        ? []
        : await runInTransaction(
            async () => {
              const [model, access] = await Promise.all([this.records.getModel(), this.policy.load()]);
              return wikiGraphRecordTypes(model, typeIds, access.canReadType).map((type) => ({
                ...type,
                count: counts.get(type.id) ?? 0,
                list: lists.has(type.id),
              }));
            },
            { readOnly: true },
          );

    return {
      ok: true as const,
      data: {
        id: page.id,
        linkedFrom,
        linksTo,
        missing: missingPageIds.length,
        missingPageIds,
        records,
        ...(syncing ? { syncing: true } : {}),
      },
    };
  }
}
