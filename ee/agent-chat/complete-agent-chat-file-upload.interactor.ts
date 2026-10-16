import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { RecordFileId, RecordFileDto } from "@/features/record-files/record-file.schema";
import type { RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordFileIdSchema } from "@/features/record-files/record-file.schema";
import { recordFileDto } from "@/features/record-files/record-file-dto";

export type AgentChatFileTextExtraction = (companyId: string) => { extractFile(fileId: string): Promise<void> };

@TenantInteractor()
export class CompleteAgentChatFileUploadInteractor extends AuthenticatedInteractor<RecordFileId, RecordFileDto> {
  constructor(
    private entitlements: EntitlementService,
    private files: Pick<RecordFileUploadRepo, "getFileCompanyWide">,
    private drivers: FileStorageDrivers,
    private extraction: AgentChatFileTextExtraction,
    private maxBytes: number,
  ) {
    super();
  }

  @Validate(RecordFileIdSchema)
  async invoke({ fileId }: RecordFileId): Validated<RecordFileDto> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const file = await this.files.getFileCompanyWide(fileId);
    if (!file || file.status !== "pending" || file.fieldId !== null || file.uploadedById !== this.userId)
      return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    const stored = await this.drivers(file.storageDriver).head(file.storageKey);
    if (!stored || stored.size !== file.size || stored.size > this.maxBytes)
      return fail(CustomErrorCode.recordFileUploadIncomplete, [], { size: file.size });
    if (file.extractionStatus === "pending") await this.extraction(this.companyId).extractFile(file.id);
    const completed = await this.files.getFileCompanyWide(file.id);
    if (!completed) return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    return { ok: true, data: recordFileDto(completed) };
  }
}
