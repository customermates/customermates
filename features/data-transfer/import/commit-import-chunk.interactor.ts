import type { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import type { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import type { CreateManyOrganizationsInteractor } from "@/features/organizations/upsert/create-many-organizations.interactor";
import type { UpdateManyOrganizationsInteractor } from "@/features/organizations/upsert/update-many-organizations.interactor";
import type { CreateManyDealsInteractor } from "@/features/deals/upsert/create-many-deals.interactor";
import type { UpdateManyDealsInteractor } from "@/features/deals/upsert/update-many-deals.interactor";
import type { CreateManyServicesInteractor } from "@/features/services/upsert/create-many-services.interactor";
import type { UpdateManyServicesInteractor } from "@/features/services/upsert/update-many-services.interactor";
import type { CreateManyTasksInteractor } from "@/features/tasks/upsert/create-many-tasks.interactor";
import type { UpdateManyTasksInteractor } from "@/features/tasks/upsert/update-many-tasks.interactor";
import type { ImportChunkData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { EntityType } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ImportChunkSchema } from "../data-transfer.schema";
import { IMPORT_ENTITIES } from "./import-entity.registry";

@TenantInteractor()
export class CommitImportChunkInteractor extends AuthenticatedInteractor<ImportChunkData, Array<{ id: string }>> {
  constructor(
    private readonly createContacts: CreateManyContactsInteractor,
    private readonly updateContacts: UpdateManyContactsInteractor,
    private readonly createOrganizations: CreateManyOrganizationsInteractor,
    private readonly updateOrganizations: UpdateManyOrganizationsInteractor,
    private readonly createDeals: CreateManyDealsInteractor,
    private readonly updateDeals: UpdateManyDealsInteractor,
    private readonly createServices: CreateManyServicesInteractor,
    private readonly updateServices: UpdateManyServicesInteractor,
    private readonly createTasks: CreateManyTasksInteractor,
    private readonly updateTasks: UpdateManyTasksInteractor,
  ) {
    super();
  }

  @Validate(ImportChunkSchema)
  async invoke(data: ImportChunkData): Validated<Array<{ id: string }>> {
    switch (data.entityType) {
      case EntityType.contact:
        return data.mode === "create"
          ? await this.createContacts.invoke(collectionPayload(data.entityType, data.rows))
          : await this.updateContacts.invoke(collectionPayload(data.entityType, data.rows));
      case EntityType.organization:
        return data.mode === "create"
          ? await this.createOrganizations.invoke(collectionPayload(data.entityType, data.rows))
          : await this.updateOrganizations.invoke(collectionPayload(data.entityType, data.rows));
      case EntityType.deal:
        return data.mode === "create"
          ? await this.createDeals.invoke(collectionPayload(data.entityType, data.rows))
          : await this.updateDeals.invoke(collectionPayload(data.entityType, data.rows));
      case EntityType.service:
        return data.mode === "create"
          ? await this.createServices.invoke(collectionPayload(data.entityType, data.rows))
          : await this.updateServices.invoke(collectionPayload(data.entityType, data.rows));
      case EntityType.task:
        return data.mode === "create"
          ? await this.createTasks.invoke(collectionPayload(data.entityType, data.rows))
          : await this.updateTasks.invoke(collectionPayload(data.entityType, data.rows));
    }
  }
}

function collectionPayload<T>(entityType: EntityType, rows: unknown[]): T {
  return { [IMPORT_ENTITIES[entityType].collectionKey]: rows } as T;
}
