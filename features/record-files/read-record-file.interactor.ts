import type { Validated } from "@/core/validation/validation.utils";
import type { ReadRecordFileContentRepo } from "@/features/record-file-index/read-record-file-content.repo";
import type { ReadRecordFile, ReadRecordFileResult, RecordFileId, RecordFileReadResult } from "./record-file.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { boundedRecordFileText } from "@/features/record-file-index/record-file-text-chunk";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";
import { ReadRecordFileSchema } from "./record-file.schema";

export const RECORD_FILE_READ_MAX_LENGTH = 5_000;

@AllowInDemoMode
@TenantInteractor()
export class ReadRecordFileInteractor extends AuthenticatedInteractor<ReadRecordFile, ReadRecordFileResult> {
  constructor(
    private files: { invoke(input: RecordFileId): Validated<RecordFileReadResult> },
    private contents: ReadRecordFileContentRepo,
  ) {
    super();
  }

  @Validate(ReadRecordFileSchema)
  async invoke({ fileId, offset }: ReadRecordFile): Validated<ReadRecordFileResult> {
    const file = await this.files.invoke({ fileId });
    if (!file.ok) return file;
    const content = await this.contents.getFileContent(file.data.id);
    const text =
      content && content.status !== "detached" && content.extractionStatus === "done" ? content.extractedText : null;
    const chunk = text
      ? boundedRecordFileText({
          text,
          offset,
          maxLength: RECORD_FILE_READ_MAX_LENGTH,
          outline: false,
          render: (bounded) => bounded,
          measure: (bounded) => JSON.stringify({ ...bounded, text: untrustedText(bounded.text) }).length,
        })
      : null;
    if (!chunk) return { ok: true, data: { ...file.data, textAvailable: false } };
    const { nextOffset, totalChars } = chunk;
    return {
      ok: true,
      data: { ...file.data, textAvailable: true, text: chunk.text, offset: chunk.offset, nextOffset, totalChars },
    };
  }
}
