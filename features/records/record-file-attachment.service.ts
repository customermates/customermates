import type { RecordFileAttacher, RecordFileAttachment } from "./record-file-attacher";
import type { RecordFileRepo } from "./record-file.repo";

export class RecordFileAttachmentService implements RecordFileAttacher {
  constructor(private files: RecordFileRepo) {}

  async attach({ ref, fieldId, fileIds, previousFileIds }: RecordFileAttachment): Promise<boolean> {
    const added = [...new Set(fileIds)].filter((id) => !previousFileIds.includes(id));
    const removed = previousFileIds.filter((id) => !fileIds.includes(id));
    if (added.length && (await this.files.attachFiles(ref, fieldId, added)) !== added.length) return false;
    await this.files.detachFiles(ref, fieldId, removed);
    return true;
  }
}
