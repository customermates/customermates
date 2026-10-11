import type { GridRect } from "@/features/widget/widget-grid";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "./workspace-setup.schema";

export type SetupCrawlState = {
  status: string;
  failureReason: string | null;
  homepageUrl: string;
  registrableDomain: string;
  topics: Array<{ status: string; pageId?: string }>;
};

export type SetupCrawlSource = { url: string; title: string; text: string; category: string };

export abstract class WorkspaceSetupRepo {
  abstract findCurrent(): Promise<WorkspaceSetupRecord | null>;
  abstract get(id: string): Promise<WorkspaceSetupRecord | null>;
  abstract create(data: { websiteUrl: string | null; answers: SetupAnswers }): Promise<WorkspaceSetupRecord | null>;
  abstract restart(id: string, data: { websiteUrl: string | null; answers: SetupAnswers }): Promise<boolean>;
  abstract mutate(
    id: string,
    change: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch | null,
  ): Promise<{ setup: WorkspaceSetupRecord; changed: boolean } | null>;
  abstract storeSpreadsheet(id: string, fileName: string, bytes: Uint8Array): Promise<boolean>;
  abstract readSpreadsheet(id: string): Promise<{ fileName: string; bytes: Uint8Array } | null>;
  abstract crawlState(crawlId: string): Promise<SetupCrawlState | null>;
  abstract stopCrawl(crawlId: string): Promise<void>;
  abstract crawlSources(crawlId: string): Promise<SetupCrawlSource[]>;
  abstract knowledgeBasePages(crawlId: string): Promise<Array<{ id: string; title: string; updatedAt: Date }>>;
  abstract wikiPages(ids: string[]): Promise<Array<{ id: string; title: string; updatedAt: Date }>>;
  abstract findOwnedView(surfaceKey: string, name: string): Promise<string | null>;
  abstract ownedWidgetLayouts(): Promise<GridRect[]>;
}
