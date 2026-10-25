import type { RecordFileRepo } from "./record-file.repo";
import type { RecordRef } from "./record-model.schema";
import type { FileStorageDrivers } from "@/core/storage/file-storage-driver";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { UserAccessor } from "@/core/base/user-accessor";
import { tenantStorage } from "@/core/decorators/tenant-context";

export type RecordFileVerification = { drivers: FileStorageDrivers; maxBytes: number };

export type RecordFileAttachment = { ref: RecordRef; fieldId: string; fileIds: string[]; previousFileIds: string[] };

export class RecordFileAttachmentService extends UserAccessor {
  constructor(
    private files: RecordFileRepo,
    private verification: RecordFileVerification,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  async attach({ ref, fieldId, fileIds, previousFileIds }: RecordFileAttachment): Promise<boolean> {
    const added = [...new Set(fileIds)].filter((id) => !previousFileIds.includes(id));
    const removed = previousFileIds.filter((id) => !fileIds.includes(id));
    if (added.length) {
      const owner = tenantStorage.getStore()?.user?.id ?? null;
      if (!(await this.stored(ref, fieldId, added, owner))) return false;
      if ((await this.files.attachFiles(ref, fieldId, added, owner)) !== added.length) return false;
      await this.background.dispatch("index-record-files", { companyId: this.companyId });
    }
    await this.files.detachFiles(ref, fieldId, removed);
    return true;
  }

  private async stored(ref: RecordRef, fieldId: string, fileIds: string[], owner: string | null): Promise<boolean> {
    const rows = await this.files.getFilesCompanyWide(fileIds);
    const checks = fileIds.map(async (id) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return false;
      const chatFile = row.fieldId === null && row.status === "pending" && owner !== null && row.uploadedById === owner;
      if (!chatFile && (row.typeId !== ref.typeId || row.fieldId !== fieldId)) return false;
      if (row.recordId === ref.recordId && row.status !== "pending") return true;
      const head = await this.verification.drivers(row.storageDriver).head(row.storageKey);
      return head !== null && head.size === row.size && head.size <= this.verification.maxBytes;
    });
    return (await Promise.all(checks)).every(Boolean);
  }
}
