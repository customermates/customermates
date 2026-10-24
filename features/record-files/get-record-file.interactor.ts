import type { Validated } from "@/core/validation/validation.utils";
import type { RecordFileId, RecordFileReadResult } from "./record-file.schema";
import type { RecordFileAccessService } from "./record-file-access.service";
import type { RecordFileLinks } from "./record-file-links";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { RecordFileIdSchema } from "./record-file.schema";
import { RECORD_FILE_LINK_SECONDS } from "./record-file-grant";
import { recordFileDto } from "./record-file-dto";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordFileInteractor extends AuthenticatedInteractor<RecordFileId, RecordFileReadResult> {
  constructor(
    private access: Pick<RecordFileAccessService, "readableFile">,
    private links: RecordFileLinks,
  ) {
    super();
  }

  @Validate(RecordFileIdSchema)
  async invoke({ fileId }: RecordFileId): Validated<RecordFileReadResult> {
    const readable = await this.access.readableFile(fileId);
    if (!readable.ok) return readable;
    const file = readable.data;
    const expiresAt = new Date(Date.now() + RECORD_FILE_LINK_SECONDS * 1000);
    return {
      ok: true,
      data: {
        ...recordFileDto(file),
        downloadUrl: this.links.contentUrl("download", file.id, this.userId, expiresAt),
        downloadUrlExpiresAt: expiresAt.toISOString(),
      },
    };
  }
}
