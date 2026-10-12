import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { TrashRestoreBlockerSource } from "@/features/trash/trash-restore-blocker-source";

export class WikiPageTrashBlockers implements TrashRestoreBlockerSource {
  constructor(private wikiPages: { guidesBlockingRestore(ids: string[]): Promise<string[]> }) {}

  async blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]> {
    const blocked = new Set(await this.wikiPages.guidesBlockingRestore(items.map((item) => item.targetId)));
    return items
      .filter((item) => blocked.has(item.targetId))
      .map((item) => ({ itemId: item.id, reason: "nameTaken" as const, typeId: null }));
  }
}
