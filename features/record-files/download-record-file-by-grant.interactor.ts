import type { Validated } from "@/core/validation/validation.utils";
import type { DownloadRecordFileByToken, DownloadRecordFile } from "./record-file.schema";
import type { RecordFileDownload } from "./download-record-file.interactor";
import type { RecordFileGrantTenant } from "./record-file-grant-tenant";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { DownloadRecordFileByTokenSchema } from "./record-file.schema";

@AllowInDemoMode
@SystemInteractor
export class DownloadRecordFileByGrantInteractor {
  constructor(
    private grants: RecordFileGrantTenant,
    private content: { invoke(input: DownloadRecordFile): Validated<RecordFileDownload> },
  ) {}

  @Validate(DownloadRecordFileByTokenSchema)
  async invoke({ token, ...input }: DownloadRecordFileByToken): Validated<RecordFileDownload> {
    return this.grants.run("download", input.fileId, token, () => this.content.invoke(input));
  }
}
