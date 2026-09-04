import type { BulkWritePrecheck } from "@/core/base/base-dry-run-import.interactor";
import type { DryRunImportData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { BaseDryRunImportInteractor } from "@/core/base/base-dry-run-import.interactor";
import { CreateManyServicesSchema } from "@/features/services/upsert/create-many-services.interactor";
import { DryRunImportSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UpdateManyServicesSchema } from "@/features/services/upsert/update-many-services.interactor";
import { Validate } from "@/core/decorators/validate.decorator";

@TenantInteractor({
  permissions: [
    { resource: Resource.services, action: Action.create },
    { resource: Resource.services, action: Action.update },
  ],
  condition: "OR",
})
export class DryRunImportServicesInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("services", CreateManyServicesSchema, UpdateManyServicesSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}
