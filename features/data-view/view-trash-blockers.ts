import type { RecordRepo } from "@/features/records/record.repo";
import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { TrashRestoreBlockerSource } from "@/features/trash/trash-restore-blocker-source";

export class ViewTrashBlockers implements TrashRestoreBlockerSource {
  constructor(private records: Pick<RecordRepo, "getModel">) {}

  async blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]> {
    const model = await this.records.getModel();
    const live = new Set(model.types.filter((type) => !type.archived).map((type) => type.id));
    return items
      .filter((item) => item.typeId !== null && !live.has(item.typeId))
      .map((item) => ({ itemId: item.id, reason: "listDeleted" as const, typeId: item.typeId }));
  }
}
