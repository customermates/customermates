import type { ExportPageResult } from "@/core/base/base-export-records-page.interactor";
import type { ExportRecordsPageData } from "../data-transfer.schema";
import type { ExportableRecord } from "./export-row-mapper";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseExportRecordsPageInteractor } from "@/core/base/base-export-records-page.interactor";
import { ExportRecordsPageSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ExportDealsPageInteractor extends BaseExportRecordsPageInteractor<ExportableRecord> {
  @Validate(ExportRecordsPageSchema)
  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<ExportableRecord>> {
    return await super.invoke(data);
  }
}
