import type { RecordRepo, StoredRecord } from "@/features/records/record.repo";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { trashVisibility } from "./trash-handlers";

export class TrashedRecordAccess {
  constructor(
    private records: Pick<RecordRepo, "getRecordCompanyWide">,
    private trash: Pick<TrashRepo, "find">,
    private handlers: TrashKindHandler[],
  ) {}

  async find(ref: RecordRef): Promise<{ record: StoredRecord; item: TrashItem } | null> {
    const record = await this.records.getRecordCompanyWide(ref, { includeTrash: true });
    if (!record?.trashItemId) return null;
    const [item] = await this.trash.find({ ids: [record.trashItemId] }, await trashVisibility(this.handlers));
    return item ? { record, item } : null;
  }
}
