import type { RecordFileAttacher, RecordFileAttachment } from "./record-file-attacher";
import type { RecordFileRepo } from "./record-file.repo";
import type { RecordFileIndexDispatcher } from "./record-file-index-dispatcher";
import type { RecordRef } from "./record-model.schema";
import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";

import { UserAccessor } from "@/core/base/user-accessor";
import { afterCommit } from "@/core/decorators/after-commit";

export type RecordFileVerification = { drivers: FileStorageDrivers; maxBytes: number };

export class RecordFileAttachmentService extends UserAccessor implements RecordFileAttacher {
  constructor(
    private files: RecordFileRepo,
    private verification?: RecordFileVerification,
    private indexer?: RecordFileIndexDispatcher,
    private scopedCompanyId?: string,
  ) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async attach({ ref, fieldId, fileIds, previousFileIds }: RecordFileAttachment): Promise<boolean> {
    const added = [...new Set(fileIds)].filter((id) => !previousFileIds.includes(id));
    const removed = previousFileIds.filter((id) => !fileIds.includes(id));
    if (added.length) {
      if (!(await this.stored(ref, fieldId, added))) return false;
      if ((await this.files.attachFiles(ref, fieldId, added)) !== added.length) return false;
      const indexer = this.indexer;
      if (indexer) {
        const request = { companyId: this.companyId, fileIds: added };
        await afterCommit(() => indexer.dispatch(request));
      }
    }
    await this.files.detachFiles(ref, fieldId, removed);
    return true;
  }

  private async stored(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<boolean> {
    const verification = this.verification;
    if (!verification) return true;
    const rows = await this.files.getFilesCompanyWide(fileIds);
    for (const id of fileIds) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.typeId !== ref.typeId || row.fieldId !== fieldId) return false;
      if (row.recordId === ref.recordId && row.status !== "pending") continue;
      const head = await verification.drivers(row.storageDriver).head(row.storageKey);
      if (!head || head.size !== row.size || head.size > verification.maxBytes) return false;
    }
    return true;
  }
}
