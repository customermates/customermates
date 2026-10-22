import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-driver";
import type { RecordFileId } from "./record-file.schema";
import type { RecordFilePreview } from "./record-file-preview.schema";
import type { RecordFileAccessService } from "./record-file-access.service";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { readCappedStream } from "@/core/storage/read-capped-stream";
import { RECORD_FILE_TEXT_MAX_BYTES } from "@/features/record-file-index/record-file-text";
import { RecordFileIdSchema } from "./record-file.schema";
import { recordFilePreviewFormat } from "./record-file-preview.schema";
import { createRecordFilePreview } from "./record-file-preview";

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordFileInteractor extends AuthenticatedInteractor<RecordFileId, RecordFilePreview> {
  constructor(
    private access: Pick<RecordFileAccessService, "readableFile">,
    private drivers: FileStorageDrivers,
  ) {
    super();
  }

  @Validate(RecordFileIdSchema)
  async invoke({ fileId }: RecordFileId): Validated<RecordFilePreview> {
    const readable = await this.access.readableFile(fileId);
    if (!readable.ok) return readable;
    const file = readable.data;
    const format = recordFilePreviewFormat(file.mimeType, file.name);
    if (!format) return { ok: true, data: { kind: "unavailable", reason: "unsupported" } };
    if (file.size > RECORD_FILE_TEXT_MAX_BYTES) return { ok: true, data: { kind: "unavailable", reason: "tooLarge" } };
    const stored = await this.drivers(file.storageDriver).read(file.storageKey);
    if (!stored) return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    const read = await readCappedStream(stored.stream, RECORD_FILE_TEXT_MAX_BYTES);
    return {
      ok: true,
      data: read.ok ? await createRecordFilePreview(read.bytes, format) : { kind: "unavailable", reason: "tooLarge" },
    };
  }
}
