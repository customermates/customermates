import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { TrashRestoreBlockerSource } from "@/features/trash/trash-restore-blocker-source";

export class WidgetTrashBlockers implements TrashRestoreBlockerSource {
  constructor(private widgets: { widgetsOnTrashedViews(ids: string[]): Promise<string[]> }) {}

  async blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]> {
    const hidden = new Set(await this.widgets.widgetsOnTrashedViews(items.map((item) => item.targetId)));
    return items
      .filter((item) => hidden.has(item.targetId))
      .map((item) => ({ itemId: item.id, reason: "parentDeleted" as const, typeId: null }));
  }
}
