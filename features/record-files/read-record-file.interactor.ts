import type { Validated } from "@/core/validation/validation.utils";
import type { ReadRecordFile, ReadRecordFileResult, RecordFileId, RecordFileReadResult } from "./record-file.schema";
import type { RecordFileTextReader } from "./record-file-text-reader";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ReadRecordFileSchema } from "./record-file.schema";

@AllowInDemoMode
@TenantInteractor()
export class ReadRecordFileInteractor extends AuthenticatedInteractor<ReadRecordFile, ReadRecordFileResult> {
  constructor(
    private files: { invoke(input: RecordFileId): Validated<RecordFileReadResult> },
    private text: RecordFileTextReader,
  ) {
    super();
  }

  @Validate(ReadRecordFileSchema)
  async invoke({ fileId, offset }: ReadRecordFile): Validated<ReadRecordFileResult> {
    const file = await this.files.invoke({ fileId });
    if (!file.ok) return file;
    const chunk = file.data.status === "ready" ? await this.text.read(file.data.id, offset) : null;
    if (!chunk) return { ok: true, data: { ...file.data, textAvailable: false } };
    const { text, nextOffset, totalChars } = chunk;
    return {
      ok: true,
      data: { ...file.data, textAvailable: true, text, offset: chunk.offset, nextOffset, totalChars },
    };
  }
}
