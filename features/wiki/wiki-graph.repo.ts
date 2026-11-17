import type { WikiLinkTargetKind } from "@/generated/prisma";
import type { WikiGraphPositions } from "./wiki-graph-layout";
import type { WikiPageKind } from "./wiki.schema";

export type WikiGraphPage = {
  id: string;
  title: string;
  kind: WikiPageKind;
  whenToUse: string | null;
  updatedAt: Date;
};

export type WikiStoredLink = {
  pageId: string;
  targetKind: WikiLinkTargetKind;
  targetId: string;
  targetTypeId: string | null;
};

export type WikiStoredLayout = { linksHash: string; positions: WikiGraphPositions };

export type WikiLinkSyncResult = { synced: number; remaining: boolean; busy?: boolean };

export abstract class WikiGraphRepo {
  abstract syncStaleLinks(args: { baseUrl: string; limit: number }): Promise<WikiLinkSyncResult>;
  abstract loadGraphPages(): Promise<WikiGraphPage[]>;
  abstract loadPagesByIds(ids: string[]): Promise<WikiGraphPage[]>;
  abstract loadLinks(): Promise<WikiStoredLink[]>;
  abstract loadLinksOfPage(pageId: string): Promise<{ outgoing: WikiStoredLink[]; incomingPageIds: string[] }>;
  abstract loadLayout(): Promise<WikiStoredLayout | null>;
  abstract saveLayout(layout: WikiStoredLayout): Promise<WikiGraphPositions>;
  abstract updateLayoutPositions(
    update: (positions: WikiGraphPositions) => WikiGraphPositions,
  ): Promise<WikiGraphPositions | null>;
}
