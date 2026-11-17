import type { WikiGraphPositions } from "./wiki-graph-layout";
import type {
  WikiGraphPage,
  WikiGraphRepo,
  WikiLinkSyncResult,
  WikiStoredLayout,
  WikiStoredLink,
} from "./wiki-graph.repo";
import type { WikiLinkSyncRepo } from "./wiki-link-sync.repo";
import type { Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { isBusyDatabaseError } from "@/core/errors/prisma-client-error";
import * as ErrorReporter from "@/core/observability/server";

import { extractWikiLinkTargets } from "./wiki-link-targets";

const GRAPH_PAGE_SELECT = { id: true, title: true, kind: true, whenToUse: true, updatedAt: true } as const;
const LINK_SELECT = { pageId: true, targetKind: true, targetId: true, targetTypeId: true } as const;
const SYNC_LOCK_WAIT_MS = 100;

function positionsFromJson(value: Prisma.JsonValue): WikiGraphPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const positions: WikiGraphPositions = {};
  for (const [id, stored] of Object.entries(value)) {
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
    const { x, y, pinned } = stored as { x?: unknown; y?: unknown; pinned?: unknown };
    if (typeof x !== "number" || typeof y !== "number") continue;
    positions[id] = pinned === true ? { x, y, pinned: true } : { x, y };
  }
  return positions;
}

export class PrismaWikiGraphRepo extends TenantRepository implements WikiGraphRepo {
  constructor(private readonly pages: WikiLinkSyncRepo) {
    super();
  }

  async syncStaleLinks({ baseUrl, limit }: { baseUrl: string; limit: number }): Promise<WikiLinkSyncResult> {
    const stale = (await this.pages.listLinkSyncCandidates()).filter(
      (page) => page.linksSyncedAt?.getTime() !== page.updatedAt.getTime(),
    );
    const batch = stale.slice(0, limit);
    if (batch.length === 0) return { synced: 0, remaining: false };
    const workspaceSlug = await this.workspaceSlug();
    const pages = await this.pages.loadPagesForLinkSync(batch.map((page) => page.id));
    let synced = 0;
    for (const page of pages) {
      let targets: ReturnType<typeof extractWikiLinkTargets> = { pages: [], records: [], lists: [] };
      try {
        targets = extractWikiLinkTargets(page.markdown, { baseUrl, workspaceSlug, pageId: page.id });
      } catch (error) {
        ErrorReporter.captureException(error, { tags: { kind: "wiki-link-extract" }, extra: { pageId: page.id } });
      }
      let written: boolean;
      try {
        written = await runInTransaction(
          async () => {
            if (!(await this.pages.markLinksSynced(page.id, page.updatedAt))) return false;
            await this.prisma.wikiPageLink.deleteMany({ where: { companyId: this.companyId, pageId: page.id } });
            const rows = [
              ...targets.pages.map((targetId) => ({
                companyId: this.companyId,
                pageId: page.id,
                targetKind: "page" as const,
                targetId,
                targetTypeId: null,
              })),
              ...targets.records.map((record) => ({
                companyId: this.companyId,
                pageId: page.id,
                targetKind: "record" as const,
                targetId: record.recordId,
                targetTypeId: record.typeId,
              })),
              ...targets.lists.map((typeId) => ({
                companyId: this.companyId,
                pageId: page.id,
                targetKind: "list" as const,
                targetId: typeId,
                targetTypeId: typeId,
              })),
            ];
            if (rows.length > 0) await this.prisma.wikiPageLink.createMany({ data: rows, skipDuplicates: true });
            return true;
          },
          { companyId: this.companyId, companyLockWait: SYNC_LOCK_WAIT_MS },
        );
      } catch (error) {
        if (isBusyDatabaseError(error)) return { synced, remaining: true, busy: true };
        throw error;
      }
      if (written) synced += 1;
    }
    return { synced, remaining: stale.length > batch.length };
  }

  private async workspaceSlug(): Promise<string | null> {
    const company = await this.prisma.company.findUnique({ where: { id: this.companyId }, select: { slug: true } });
    return company?.slug ?? null;
  }

  async loadGraphPages(): Promise<WikiGraphPage[]> {
    return this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId, deletedAt: null },
      select: GRAPH_PAGE_SELECT,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  }

  async loadPagesByIds(ids: string[]): Promise<WikiGraphPage[]> {
    if (ids.length === 0) return [];
    return this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId, deletedAt: null, id: { in: ids } },
      select: GRAPH_PAGE_SELECT,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  }

  async loadLinks(): Promise<WikiStoredLink[]> {
    return this.prisma.wikiPageLink.findMany({
      where: { companyId: this.companyId, page: { deletedAt: null } },
      select: LINK_SELECT,
      orderBy: [{ pageId: "asc" }, { targetId: "asc" }],
    });
  }

  async loadLinksOfPage(pageId: string): Promise<{ outgoing: WikiStoredLink[]; incomingPageIds: string[] }> {
    const [outgoing, incoming] = await Promise.all([
      this.prisma.wikiPageLink.findMany({
        where: { companyId: this.companyId, pageId },
        select: LINK_SELECT,
        orderBy: [{ targetKind: "asc" }, { targetId: "asc" }],
      }),
      this.prisma.wikiPageLink.findMany({
        where: { companyId: this.companyId, targetKind: "page", targetId: pageId, page: { deletedAt: null } },
        select: { pageId: true },
        orderBy: { pageId: "asc" },
      }),
    ]);
    return { outgoing, incomingPageIds: incoming.map((link) => link.pageId) };
  }

  async loadLayout(): Promise<WikiStoredLayout | null> {
    const layout = await this.prisma.wikiGraphLayout.findUnique({
      where: { companyId: this.companyId },
      select: { linksHash: true, positions: true },
    });
    return layout ? { linksHash: layout.linksHash, positions: positionsFromJson(layout.positions) } : null;
  }

  async saveLayout(layout: WikiStoredLayout): Promise<WikiGraphPositions> {
    return this.withCompanyTransaction(this.companyId, async () => {
      const current = await this.loadLayout();
      const positions: WikiGraphPositions = { ...layout.positions };
      for (const [id, stored] of Object.entries(current?.positions ?? {}))
        if (stored.pinned && id in positions) positions[id] = stored;

      const data = {
        companyId: this.companyId,
        linksHash: layout.linksHash,
        positions: positions as Prisma.InputJsonObject,
      };
      await this.prisma.wikiGraphLayout.upsert({ where: { companyId: this.companyId }, create: data, update: data });
      return positions;
    });
  }

  async updateLayoutPositions(
    update: (positions: WikiGraphPositions) => WikiGraphPositions,
  ): Promise<WikiGraphPositions | null> {
    return this.withCompanyTransaction(this.companyId, async () => {
      const layout = await this.loadLayout();
      if (!layout) return null;
      const positions = update(layout.positions);
      await this.prisma.wikiGraphLayout.update({
        where: { companyId: this.companyId },
        data: { companyId: this.companyId, positions: positions as Prisma.InputJsonObject },
      });
      return positions;
    });
  }
}
