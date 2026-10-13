import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordViewConfigurationRepo } from "./record-view-configuration.repo";
import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { TrashRestoreBlockerSource } from "@/features/trash/trash-restore-blocker-source";
import type { DroppedViewReferences } from "@/features/trash/trash.schema";

import { getTenantUser } from "@/core/decorators/tenant-context";
import { cleanRecordViewState } from "@/features/records/record-view-state";

export class ViewTrashBlockers implements TrashRestoreBlockerSource {
  constructor(
    private records: Pick<RecordRepo, "getModel">,
    private views: Pick<RecordViewConfigurationRepo, "getRecordViewStatesByIds" | "rewriteViewStateCompanyWide">,
  ) {}

  async restoreReferences(ids: string[]): Promise<DroppedViewReferences[]> {
    const [model, views] = await Promise.all([this.records.getModel(), this.views.getRecordViewStatesByIds(ids)]);
    const dropped: DroppedViewReferences[] = [];
    for (const view of views) {
      const cleaned = cleanRecordViewState(view.typeId, view.state, model);
      if (!cleaned) continue;
      const restored = { ...view.state, ...cleaned };
      const columns = new Set([
        ...(view.state.columnOrder ?? []),
        ...(view.state.hiddenColumns ?? []),
        ...Object.keys(view.state.columnWidths ?? {}),
      ]);
      const kept = new Set([
        ...(restored.columnOrder ?? []),
        ...(restored.hiddenColumns ?? []),
        ...Object.keys(restored.columnWidths ?? {}),
      ]);
      await this.views.rewriteViewStateCompanyWide(getTenantUser().companyId, view.id, cleaned);
      dropped.push({
        viewId: view.id,
        filters: Math.max(0, (view.state.filters?.length ?? 0) - (restored.filters?.length ?? 0)),
        columns: [...columns].filter((id) => !kept.has(id)).length,
        sort: Boolean(view.state.sortDescriptor && !restored.sortDescriptor),
        grouping: Boolean(
          view.state.grouping && JSON.stringify(view.state.grouping) !== JSON.stringify(restored.grouping),
        ),
      });
    }
    return dropped.filter((entry) => entry.filters || entry.columns || entry.sort || entry.grouping);
  }

  async blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]> {
    const model = await this.records.getModel();
    const live = new Set(model.types.filter((type) => !type.archived).map((type) => type.id));
    return items
      .filter((item) => item.typeId !== null && !live.has(item.typeId))
      .map((item) => ({
        itemId: item.id,
        reason: "listDeleted" as const,
        typeId: item.typeId,
      }));
  }
}
