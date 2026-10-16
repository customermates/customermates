import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { RecordFileLinks } from "@/features/record-files/record-file-links";
import type { RecordFileUploadService } from "@/features/record-files/record-file-upload.service";
import type { CreateChatFileUpload, CreateRecordFileUploadResult } from "@/features/record-files/record-file.schema";

import { getLocale } from "next-intl/server";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import { unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CreateChatFileUploadSchema } from "@/features/record-files/record-file.schema";
import { recordFileUploadTarget } from "@/features/record-files/record-file-upload-target";

@TenantInteractor()
export class CreateAgentChatFileUploadInteractor extends AuthenticatedInteractor<
  CreateChatFileUpload,
  CreateRecordFileUploadResult
> {
  constructor(
    private entitlements: EntitlementService,
    private uploads: RecordFileUploadService,
    private drivers: FileStorageDrivers,
    private links: RecordFileLinks,
  ) {
    super();
  }

  @Validate(CreateChatFileUploadSchema)
  async invoke(input: CreateChatFileUpload): Validated<CreateRecordFileUploadResult> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const locale = await getLocale();
    const reserved = await runInTransaction(
      async () => ({ ok: true as const, data: await this.uploads.reserveChatFile(input, locale) }),
      { companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS },
    ).catch(unwoundFailure);
    if (!reserved.ok) return reserved;
    return { ok: true, data: await recordFileUploadTarget(reserved.data, this.drivers, this.links, this.userId) };
  }
}
