import type { Validated } from "@/core/validation/validation.utils";
import type { RecordFileAccessService } from "@/features/record-files/record-file-access.service";
import type { ReadRecordFileContentRepo } from "./read-record-file-content.repo";
import type { ReadRecordFileContent, RecordFileContent } from "./record-file-index.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { ReadRecordFileContentSchema } from "./record-file-index.schema";

@AllowInDemoMode
@TenantInteractor()
export class ReadRecordFileContentInteractor extends AuthenticatedInteractor<ReadRecordFileContent, RecordFileContent> {
  constructor(
    private access: Pick<RecordFileAccessService, "readableFile">,
    private files: ReadRecordFileContentRepo,
  ) {
    super();
  }

  @Validate(ReadRecordFileContentSchema)
  async invoke({ fileId }: ReadRecordFileContent): Validated<RecordFileContent> {
    const readable = await this.access.readableFile(fileId);
    if (!readable.ok) return readable;
    const { typeId, recordId, fieldId, status } = readable.data;
    const file = await this.files.getFileContent(fileId);
    if (!file || status !== "ready" || file.status !== "ready" || !typeId || !recordId || !fieldId)
      return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    return {
      ok: true,
      data: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        ref: { typeId, recordId },
        fieldId,
        extraction: {
          status: file.extractionStatus,
          truncated: file.textTruncated,
          indexedAt: file.indexedAt?.toISOString() ?? null,
        },
        text: file.extractionStatus === "done" ? file.extractedText : null,
      },
    };
  }
}
