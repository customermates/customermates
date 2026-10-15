import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { RecordRepo } from "@/features/records/record.repo";
import type { MutateRecordInput, RecordOperationResult } from "@/features/records/record-query.schema";
import type { RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";
import type { UploadRecordFile, UploadRecordFileResult } from "./record-file.schema";
import type { RecordFileUploadService } from "./record-file-upload.service";

import { getLocale } from "next-intl/server";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RECORD_FILE_INLINE_UPLOAD_MAX_BYTES, UploadRecordFileSchema } from "./record-file.schema";
import { decodeRecordFileContent, streamOfBytes } from "./record-file-content";
import { recordFileDto } from "./record-file-dto";
import { storageSizeLabel } from "./storage-size";

@TenantInteractor()
export class UploadRecordFileInteractor extends AuthenticatedInteractor<UploadRecordFile, UploadRecordFileResult> {
  constructor(
    private uploads: RecordFileUploadService,
    private files: Pick<RecordFileUploadRepo, "getFileCompanyWide" | "markFileUploaded">,
    private drivers: FileStorageDrivers,
    private records: Pick<RecordRepo, "getModel" | "getRecordCompanyWide">,
    private mutate: { invoke(input: MutateRecordInput): Validated<RecordOperationResult> },
  ) {
    super();
  }

  @Validate(UploadRecordFileSchema)
  async invoke(input: UploadRecordFile): Validated<UploadRecordFileResult> {
    const locale = await getLocale();
    const bytes = decodeRecordFileContent(input.content);
    if (!bytes) return fail(CustomErrorCode.recordFileContentInvalid, ["content"]);
    if (bytes.byteLength > RECORD_FILE_INLINE_UPLOAD_MAX_BYTES) {
      return fail(CustomErrorCode.recordFileTooLarge, ["content"], {
        limit: storageSizeLabel(RECORD_FILE_INLINE_UPLOAD_MAX_BYTES, locale),
      });
    }
    const reserved = await runInTransaction(
      async () => ({
        ok: true as const,
        data: await this.uploads.reserve(
          {
            typeId: input.typeId,
            fieldId: input.fieldId,
            name: input.name,
            size: bytes.byteLength,
            mimeType: input.mimeType,
          },
          locale,
        ),
      }),
      { companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS },
    ).catch(unwoundFailure);
    if (!reserved.ok) return reserved;
    const pending = reserved.data;
    const written = await this.drivers(pending.storageDriver).writeStream(
      pending.storageKey,
      streamOfBytes(bytes),
      pending.size,
    );
    if (!written.ok) return fail(CustomErrorCode.recordFileUploadIncomplete, [], { size: pending.size });
    await this.files.markFileUploaded(pending.id, written);
    const attachment = input.recordId ? await this.attach(input, input.recordId, pending.id) : null;
    if (attachment && !attachment.ok) return attachment;
    const file = await this.files.getFileCompanyWide(pending.id);
    if (!file) return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    return {
      ok: true,
      data: {
        file: recordFileDto(file),
        attached: attachment !== null,
        ...(attachment?.data.status === "pending" ? { operationId: attachment.data.operationId } : {}),
      },
    };
  }

  private async attach(input: UploadRecordFile, recordId: string, fileId: string): Validated<RecordOperationResult> {
    const ref = { typeId: input.typeId, recordId };
    const [model, record] = await Promise.all([this.records.getModel(), this.records.getRecordCompanyWide(ref)]);
    if (!record) return failNotFound(CustomErrorCode.recordNotFound, ["recordId"]);
    const field = model.fields.find((candidate) => candidate.id === input.fieldId);
    const stored = record.values.find((value) => value.fieldId === input.fieldId);
    const current = stored?.state === "value" ? stored.textListValue : [];
    const mode = input.attach ?? (field?.multiple ? "append" : "replace");
    const ids = mode === "replace" ? [fileId] : [...current.filter((id) => id !== fileId), fileId];
    return this.mutate.invoke({
      expectedRevision: model.revision,
      idempotencyKey: `record-file-upload:${fileId}`,
      mutation: {
        action: "update",
        ref,
        expectedVersion: input.expectedVersion ?? record.version,
        fields: [{ fieldId: input.fieldId, value: { kind: "file", value: ids } }],
      },
    });
  }
}
