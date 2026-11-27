import type { GridRect } from "@/features/widget/widget-grid";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "./workspace-setup.schema";

export abstract class WorkspaceSetupRepo {
  abstract findCurrent(): Promise<WorkspaceSetupRecord | null>;
  abstract get(id: string): Promise<WorkspaceSetupRecord | null>;
  abstract create(data: { answers: SetupAnswers; templateSlug: string | null }): Promise<WorkspaceSetupRecord | null>;
  abstract restart(id: string, data: { answers: SetupAnswers; templateSlug: string | null }): Promise<boolean>;
  abstract mutate(
    id: string,
    change: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch | null,
  ): Promise<{ setup: WorkspaceSetupRecord; changed: boolean } | null>;
  abstract findWikiPageCreatedSince(title: string, since: Date): Promise<string | null>;
  abstract findOwnedView(surfaceKey: string, name: string): Promise<string | null>;
  abstract ownedWidgetLayouts(): Promise<GridRect[]>;
}
