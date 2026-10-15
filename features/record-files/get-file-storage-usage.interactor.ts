import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageUsageDto } from "./record-file.schema";
import type { RecordFileQuotaService } from "./record-file-quota.service";

import { z } from "zod";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { FileStorageUsageSchema } from "./record-file.schema";

const GetFileStorageUsageSchema = z.object({}).strict();

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, read: true })
export class GetFileStorageUsageInteractor extends AuthenticatedInteractor<void, FileStorageUsageDto> {
  constructor(private quota: Pick<RecordFileQuotaService, "usage">) {
    super();
  }

  @Validate(GetFileStorageUsageSchema)
  @ValidateOutput(FileStorageUsageSchema)
  async invoke(): Validated<FileStorageUsageDto> {
    return { ok: true, data: await this.quota.usage() };
  }
}
