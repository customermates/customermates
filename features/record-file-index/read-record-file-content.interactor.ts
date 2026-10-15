import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { ReadRecordFileContentRepo } from "./read-record-file-content.repo";
import type { ReadRecordFileContent, RecordFileContent } from "./record-file-index.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { failAuthorization, failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { decodeRecordValue } from "@/features/records/record-storage";

import { ReadRecordFileContentSchema } from "./record-file-index.schema";

@AllowInDemoMode
@TenantInteractor()
export class ReadRecordFileContentInteractor extends AuthenticatedInteractor<ReadRecordFileContent, RecordFileContent> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private files: ReadRecordFileContentRepo,
  ) {
    super();
  }

  @Validate(ReadRecordFileContentSchema)
  async invoke({ fileId }: ReadRecordFileContent): Validated<RecordFileContent> {
    return runInTransaction(
      async () => {
        const file = await this.files.getFileContent(fileId);
        if (!file?.recordId || file.status !== "ready") return failNotFound(CustomErrorCode.recordNotFound);
        const ref = { typeId: file.typeId, recordId: file.recordId };
        const [model, policy, record] = await Promise.all([
          this.records.getModel(),
          this.policy.load(),
          this.records.getRecordCompanyWide(ref),
        ]);
        const field = model.fields.find(
          (candidate) =>
            candidate.id === file.fieldId &&
            candidate.typeId === file.typeId &&
            candidate.valueType === "file" &&
            !candidate.archived,
        );
        if (!record || !field || !model.types.some((type) => type.id === ref.typeId && !type.archived))
          return failNotFound(CustomErrorCode.recordNotFound);
        if (!(await policy.canRead(record))) return failAuthorization(CustomErrorCode.permissionDenied);
        const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
        if (!(await this.records.getVisibleFields(ref, model, access)).has(field.id))
          return failAuthorization(CustomErrorCode.permissionDenied);
        const value = decodeRecordValue(
          record.values.find((candidate) => candidate.fieldId === field.id),
          field,
        );
        if (value.state !== "value" || value.value.kind !== "file" || !value.value.value.includes(file.id))
          return failNotFound(CustomErrorCode.recordNotFound);
        return {
          ok: true as const,
          data: {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            ref,
            fieldId: file.fieldId,
            extraction: {
              status: file.extractionStatus,
              truncated: file.textTruncated,
              indexedAt: file.indexedAt?.toISOString() ?? null,
            },
            text: file.extractionStatus === "done" ? file.extractedText : null,
          },
        };
      },
      { readOnly: true },
    ).catch(unwoundFailure);
  }
}
