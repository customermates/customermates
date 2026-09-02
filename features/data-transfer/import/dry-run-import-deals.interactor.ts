import type { BulkWritePrecheck } from "@/core/base/base-dry-run-import.interactor";
import type { DryRunImportData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { BaseDryRunImportInteractor } from "@/core/base/base-dry-run-import.interactor";
import { CreateManyDealsSchema } from "@/features/deals/upsert/create-many-deals.interactor";
import { DryRunImportSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UpdateManyDealsSchema } from "@/features/deals/upsert/update-many-deals.interactor";
import { Validate } from "@/core/decorators/validate.decorator";

@TenantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.create },
    { resource: Resource.deals, action: Action.update },
  ],
  condition: "OR",
})
export class DryRunImportDealsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("deals", CreateManyDealsSchema, UpdateManyDealsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}
