import type { BulkWritePrecheck } from "@/core/base/base-dry-run-import.interactor";
import type { DryRunImportData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { BaseDryRunImportInteractor } from "@/core/base/base-dry-run-import.interactor";
import { CreateManyOrganizationsSchema } from "@/features/organizations/upsert/create-many-organizations.interactor";
import { DryRunImportSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UpdateManyOrganizationsSchema } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { Validate } from "@/core/decorators/validate.decorator";

@TenantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.create },
    { resource: Resource.organizations, action: Action.update },
  ],
  condition: "OR",
})
export class DryRunImportOrganizationsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("organizations", CreateManyOrganizationsSchema, UpdateManyOrganizationsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}
