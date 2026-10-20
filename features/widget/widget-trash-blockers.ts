import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { TrashRestoreBlockerSource } from "@/features/trash/trash-restore-blocker-source";
import type { RecordRepo } from "@/features/records/record.repo";
import type { StoredWidget } from "./record-widget-store.repo";

import { recordMeasureIsValid } from "@/features/records/record-measure-validation";

export class WidgetTrashBlockers implements TrashRestoreBlockerSource {
  constructor(
    private widgets: {
      widgetsOnTrashedViews(ids: string[]): Promise<string[]>;
      findTrashedWidgets(ids: string[]): Promise<StoredWidget[]>;
    },
    private records: Pick<RecordRepo, "getModel">,
  ) {}

  async blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]> {
    const ids = items.map((item) => item.targetId);
    const hidden = new Set(await this.widgets.widgetsOnTrashedViews(ids));
    const model = await this.records.getModel();
    const liveLists = new Set(model.types.filter((type) => !type.archived).map((type) => type.id));
    for (const stored of await this.widgets.findTrashedWidgets(ids)) {
      if (stored.kind === "chart") {
        if (!recordMeasureIsValid(stored.widget.measure, model)) hidden.add(stored.widget.id);
      } else {
        const query = stored.widget.activityQuery;
        const typeIds = [
          ...query.scope.typeIds,
          ...query.scope.records.map((ref) => ref.typeId),
          ...(query.filters ?? []).flatMap((filter) => (filter.kind === "record" ? [filter.typeId] : [])),
        ];
        if (typeIds.some((id) => !liveLists.has(id))) hidden.add(stored.widget.id);
      }
    }
    return items
      .filter((item) => hidden.has(item.targetId))
      .map((item) => ({ itemId: item.id, reason: "parentDeleted" as const, typeId: null }));
  }
}
