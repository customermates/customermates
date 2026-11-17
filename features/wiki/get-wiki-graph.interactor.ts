import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiGraphRepo } from "./wiki-graph.repo";
import type { GetWikiGraphData, WikiGraph, WikiGraphNode } from "./wiki-graph.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import * as ErrorReporter from "@/core/observability/server";
import { env } from "@/env";

import { WIKI_GRAPH_MAX_NODES, layoutWikiGraph, wikiLinksHash } from "./wiki-graph-layout";
import { wikiGraphRecordTypes } from "./wiki-graph-records";
import { GetWikiGraphSchema, WikiGraphSchema } from "./wiki-graph.schema";

export const WIKI_LINK_SYNC_BATCH_PAGES = 100;
export const WIKI_LINK_SYNC_MAX_BATCHES = 5;

export async function syncWikiLinksBestEffort(repo: WikiGraphRepo, batches: number): Promise<boolean> {
  let remaining = true;
  try {
    for (let batch = 0; batch < batches && remaining; batch += 1) {
      const result = await repo.syncStaleLinks({ baseUrl: env.BASE_URL, limit: WIKI_LINK_SYNC_BATCH_PAGES });
      remaining = result.remaining;
    }
  } catch (error) {
    ErrorReporter.captureException(error, { tags: { kind: "wiki-link-sync" } });
  }
  return remaining;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class GetWikiGraphInteractor extends AuthenticatedInteractor<GetWikiGraphData, WikiGraph> {
  constructor(
    private repo: WikiGraphRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(GetWikiGraphSchema)
  @ValidateOutput(WikiGraphSchema)
  async invoke(_data: GetWikiGraphData): Validated<WikiGraph> {
    const syncing = await syncWikiLinksBestEffort(this.repo, WIKI_LINK_SYNC_MAX_BATCHES);

    const [pages, links, layout] = await Promise.all([
      this.repo.loadGraphPages(),
      this.repo.loadLinks(),
      this.repo.loadLayout(),
    ]);
    const shown = pages.slice(0, WIKI_GRAPH_MAX_NODES);
    const liveIds = new Set(pages.map((page) => page.id));
    const shownIds = new Set(shown.map((page) => page.id));
    const edges = links
      .filter((link) => link.targetKind === "page" && shownIds.has(link.pageId) && shownIds.has(link.targetId))
      .map((link) => [link.pageId, link.targetId] as const);
    const missing = new Map<string, number>();
    const recordCounts = new Map<string, number>();
    const recordTypeIds = new Set<string>();
    for (const link of links) {
      if (!shownIds.has(link.pageId)) continue;
      if (link.targetKind === "page") {
        if (!liveIds.has(link.targetId)) missing.set(link.pageId, (missing.get(link.pageId) ?? 0) + 1);
        continue;
      }
      recordCounts.set(link.pageId, (recordCounts.get(link.pageId) ?? 0) + 1);
      if (link.targetTypeId) recordTypeIds.add(link.targetTypeId);
    }

    const nodeIds = shown.map((page) => page.id);
    const linksHash = wikiLinksHash(nodeIds, edges);
    let positions = layout?.positions ?? {};
    if (!layout || layout.linksHash !== linksHash || nodeIds.some((id) => !positions[id])) {
      positions = await this.repo.saveLayout({
        linksHash,
        positions: layoutWikiGraph({
          nodeIds,
          links: edges,
          previous: layout?.positions,
          hubId: shown.find((page) => page.kind === "guide")?.id ?? null,
        }),
      });
    }

    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    for (const [source, target] of edges) {
      outbound.set(source, (outbound.get(source) ?? 0) + 1);
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }

    const recordTypes =
      recordTypeIds.size === 0
        ? []
        : await runInTransaction(
            async () => {
              const [model, access] = await Promise.all([this.records.getModel(), this.policy.load()]);
              return wikiGraphRecordTypes(model, recordTypeIds, access.canReadType);
            },
            { readOnly: true },
          );

    const nodes: WikiGraphNode[] = shown.map((page) => {
      const position = positions[page.id];
      return {
        id: page.id,
        title: page.title,
        kind: page.kind,
        whenToUse: page.whenToUse,
        updatedAt: page.updatedAt,
        inbound: inbound.get(page.id) ?? 0,
        outbound: outbound.get(page.id) ?? 0,
        missing: missing.get(page.id) ?? 0,
        records: recordCounts.get(page.id) ?? 0,
        x: position?.x ?? 0.5,
        y: position?.y ?? 0.5,
        pinned: position?.pinned === true,
      };
    });

    return {
      ok: true as const,
      data: {
        nodes,
        links: edges.map(([source, target]) => ({ source, target })),
        recordTypes,
        truncated: pages.length > shown.length,
        syncing,
      },
    };
  }
}
