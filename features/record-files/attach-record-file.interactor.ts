import type { Validated } from "@/core/validation/validation.utils";
import type { RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";
import type { AttachRecordFile, UploadRecordFileResult } from "./record-file.schema";
import type { RecordFileAccessService } from "./record-file-access.service";
import type { RecordFileFieldWriteDeps } from "./record-file-field-write";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AttachRecordFileSchema } from "./record-file.schema";
import { recordFileDto } from "./record-file-dto";
import { writeRecordFileIntoField } from "./record-file-field-write";

@TenantInteractor()
export class AttachRecordFileInteractor extends AuthenticatedInteractor<AttachRecordFile, UploadRecordFileResult> {
  constructor(
    private files: Pick<RecordFileUploadRepo, "getFileCompanyWide">,
    private access: Pick<RecordFileAccessService, "readable">,
    private write: RecordFileFieldWriteDeps,
  ) {
    super();
  }

  @Validate(AttachRecordFileSchema)
  async invoke({ fileId, ...target }: AttachRecordFile): Validated<UploadRecordFileResult> {
    const file = await this.files.getFileCompanyWide(fileId);
    if (!file || file.status === "detached" || (file.status === "pending" && file.uploadedById !== this.userId))
      return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    if (file.status === "ready") {
      if (file.recordId !== target.recordId || file.typeId !== target.typeId || file.fieldId !== target.fieldId)
        return fail(CustomErrorCode.recordFileUnavailable, ["fileId"]);
      const readable = await runInTransaction(
        async () => ({ ok: true as const, data: await this.access.readable(fileId) }),
        { readOnly: true },
      ).catch(unwoundFailure);
      if (!readable.ok) return readable;
      return { ok: true, data: { file: recordFileDto(readable.data), attached: true } };
    }
    if (file.fieldId !== null && (file.fieldId !== target.fieldId || file.typeId !== target.typeId))
      return fail(CustomErrorCode.recordFileUnavailable, ["fieldId"]);
    const written = await writeRecordFileIntoField(
      this.write,
      file.id,
      target,
      `record-file-attach:${file.id}:${target.recordId}:${target.fieldId}`,
    );
    if (!written.ok) return written;
    const attached = written.data.status === "completed";
    const current = attached ? await this.files.getFileCompanyWide(file.id) : file;
    if (!current) return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    return {
      ok: true,
      data: {
        file: recordFileDto(current),
        attached,
        ...(written.data.status === "pending" ? { operationId: written.data.operationId } : {}),
      },
    };
  }
}
