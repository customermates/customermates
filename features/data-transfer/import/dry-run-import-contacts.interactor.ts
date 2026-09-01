import type { BulkWritePrecheck } from "@/core/base/base-dry-run-import.interactor";
import type { DryRunImportData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { BaseDryRunImportInteractor } from "@/core/base/base-dry-run-import.interactor";
import { CreateManyContactsSchema } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { DryRunImportSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UpdateManyContactsSchema } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { Validate } from "@/core/decorators/validate.decorator";

@TenantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.create },
    { resource: Resource.contacts, action: Action.update },
  ],
  condition: "OR",
})
export class DryRunImportContactsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("contacts", CreateManyContactsSchema, UpdateManyContactsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}
