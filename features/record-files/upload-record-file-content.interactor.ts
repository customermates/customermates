import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";
import type { UploadRecordFileContent, UploadRecordFileContentResult } from "./record-file.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { emptyFileStream } from "@/core/storage/read-capped-stream";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { UploadRecordFileContentSchema } from "./record-file.schema";

@TenantInteractor()
export class UploadRecordFileContentInteractor extends AuthenticatedInteractor<
  UploadRecordFileContent,
  UploadRecordFileContentResult
> {
  constructor(
    private files: Pick<RecordFileUploadRepo, "getFileCompanyWide" | "markFileUploaded">,
    private drivers: FileStorageDrivers,
  ) {
    super();
  }

  @Validate(UploadRecordFileContentSchema)
  async invoke({ fileId, body }: UploadRecordFileContent): Validated<UploadRecordFileContentResult> {
    const stream = body ?? emptyFileStream();
    const file = await this.files.getFileCompanyWide(fileId);
    if (!file || file.status !== "pending" || file.uploadedById !== this.userId) {
      await stream.cancel().catch(() => undefined);
      return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    }
    const driver = this.drivers(file.storageDriver);
    const written = await driver.writeStream(file.storageKey, stream, file.size);
    if (!written.ok || written.size !== file.size) {
      if (written.ok) await driver.delete([file.storageKey]);
      return fail(CustomErrorCode.recordFileUploadIncomplete, [], { size: file.size });
    }
    if (!(await this.files.markFileUploaded(file.id, written)) && !(await this.files.getFileCompanyWide(file.id))) {
      await driver.delete([file.storageKey]);
      return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    }
    return { ok: true, data: { fileId: file.id, size: written.size, sha256: written.sha256 } };
  }
}
