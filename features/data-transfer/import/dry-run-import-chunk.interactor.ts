import type { DryRunImportContactsInteractor } from "./dry-run-import-contacts.interactor";
import type { DryRunImportOrganizationsInteractor } from "./dry-run-import-organizations.interactor";
import type { DryRunImportDealsInteractor } from "./dry-run-import-deals.interactor";
import type { DryRunImportServicesInteractor } from "./dry-run-import-services.interactor";
import type { DryRunImportTasksInteractor } from "./dry-run-import-tasks.interactor";
import type { ImportChunkData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { EntityType } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ImportChunkSchema } from "../data-transfer.schema";

@TenantInteractor()
export class DryRunImportChunkInteractor extends AuthenticatedInteractor<ImportChunkData, null> {
  constructor(
    private readonly contacts: DryRunImportContactsInteractor,
    private readonly organizations: DryRunImportOrganizationsInteractor,
    private readonly deals: DryRunImportDealsInteractor,
    private readonly services: DryRunImportServicesInteractor,
    private readonly tasks: DryRunImportTasksInteractor,
  ) {
    super();
  }

  @Validate(ImportChunkSchema)
  async invoke(data: ImportChunkData): Validated<null> {
    const input = { mode: data.mode, rows: data.rows };
    switch (data.entityType) {
      case EntityType.contact:
        return await this.contacts.invoke(input);
      case EntityType.organization:
        return await this.organizations.invoke(input);
      case EntityType.deal:
        return await this.deals.invoke(input);
      case EntityType.service:
        return await this.services.invoke(input);
      case EntityType.task:
        return await this.tasks.invoke(input);
    }
  }
}
