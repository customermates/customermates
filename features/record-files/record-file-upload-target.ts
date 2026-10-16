import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { PendingRecordFile } from "@/features/records/record-file-upload.repo";
import type { CreateRecordFileUploadResult } from "./record-file.schema";
import type { RecordFileLinks } from "./record-file-links";

import { RECORD_FILE_UPLOAD_SECONDS } from "./record-file.schema";

export async function recordFileUploadTarget(
  file: PendingRecordFile,
  drivers: FileStorageDrivers,
  links: RecordFileLinks,
  userId: string,
): Promise<CreateRecordFileUploadResult> {
  const target = await drivers(file.storageDriver).createUpload({
    fileId: file.id,
    key: file.storageKey,
    size: file.size,
    mimeType: file.mimeType,
    expiresInSeconds: RECORD_FILE_UPLOAD_SECONDS,
  });
  const url =
    file.storageDriver === "database"
      ? links.withUploadGrant(target.url, file.id, userId, new Date(target.expiresAt))
      : target.url;
  return { fileId: file.id, upload: { ...target, url } };
}
