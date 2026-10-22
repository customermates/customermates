import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-driver";
import type { CreateRecordFileUpload, CreateRecordFileUploadResult } from "./record-file.schema";
import type { RecordFileUploadService } from "./record-file-upload.service";
import type { RecordFileLinks } from "./record-file-links";

import { getLocale } from "next-intl/server";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import { unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CreateRecordFileUploadSchema } from "./record-file.schema";
import { recordFileUploadTarget } from "./record-file-upload-target";

@TenantInteractor()
export class CreateRecordFileUploadInteractor extends AuthenticatedInteractor<
  CreateRecordFileUpload,
  CreateRecordFileUploadResult
> {
  constructor(
    private uploads: RecordFileUploadService,
    private drivers: FileStorageDrivers,
    private links: RecordFileLinks,
  ) {
    super();
  }

  @Validate(CreateRecordFileUploadSchema)
  async invoke(input: CreateRecordFileUpload): Validated<CreateRecordFileUploadResult> {
    const locale = await getLocale();
    const reserved = await runInTransaction(
      async () => ({ ok: true as const, data: await this.uploads.reserve(input, locale) }),
      { companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS },
    ).catch(unwoundFailure);
    if (!reserved.ok) return reserved;
    return { ok: true, data: await recordFileUploadTarget(reserved.data, this.drivers, this.links, this.userId) };
  }
}
