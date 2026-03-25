"use server";

import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { UpsertCustomColumnData } from "@/features/custom-column/upsert-custom-column.interactor";
import type { GetCustomColumnsByEntityTypeData } from "@/features/custom-column/get-custom-columns-by-entity-type.interactor";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type { UpsertFilterPresetData } from "@/features/p13n/upsert-filter-preset.interactor";
import type { DeleteFilterPresetData } from "@/features/p13n/delete-filter-preset.interactor";

import { EntityType } from "@/generated/prisma";

import { UpsertCustomColumnInteractor } from "@/features/custom-column/upsert-custom-column.interactor";
import { DeleteCustomColumnInteractor } from "@/features/custom-column/delete-custom-column.interactor";
import { GetCustomColumnsByEntityTypeInteractor } from "@/features/custom-column/get-custom-columns-by-entity-type.interactor";
import { di } from "@/core/dependency-injection/container";
import { UpsertP13nInteractor } from "@/features/p13n/upsert-p13n.interactor";
import { UpsertFilterPresetInteractor } from "@/features/p13n/upsert-filter-preset.interactor";
import { DeleteFilterPresetInteractor } from "@/features/p13n/delete-filter-preset.interactor";
import { UpdateContactInteractor } from "@/features/contacts/upsert/update-contact.interactor";
import { UpdateOrganizationInteractor } from "@/features/organizations/upsert/update-organization.interactor";
import { UpdateDealInteractor } from "@/features/deals/upsert/update-deal.interactor";
import { UpdateServiceInteractor } from "@/features/services/upsert/update-service.interactor";
import { UpdateTaskInteractor } from "@/features/tasks/upsert/update-task.interactor";
import { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { UpdateManyOrganizationsInteractor } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { UpdateManyDealsInteractor } from "@/features/deals/upsert/update-many-deals.interactor";
import { UpdateManyServicesInteractor } from "@/features/services/upsert/update-many-services.interactor";
import { UpdateManyTasksInteractor } from "@/features/tasks/upsert/update-many-tasks.interactor";
import { DeleteManyContactsInteractor } from "@/features/contacts/delete/delete-many-contacts.interactor";
import { DeleteManyOrganizationsInteractor } from "@/features/organizations/delete/delete-many-organizations.interactor";
import { DeleteManyDealsInteractor } from "@/features/deals/delete/delete-many-deals.interactor";
import { DeleteManyServicesInteractor } from "@/features/services/delete/delete-many-services.interactor";
import { DeleteManyTasksInteractor } from "@/features/tasks/delete/delete-many-tasks.interactor";
import { serializeResult } from "@/core/utils/action-result";
import {
  GetEntityChangeHistoryByIdInteractor,
  type GetEntityChangeHistoryByIdData,
} from "@/ee/audit-log/get/get-entity-change-history-by-id.interactor";

export async function deleteCustomColumnAction(id: string) {
  return di.get(DeleteCustomColumnInteractor).invoke({ id });
}

export async function upsertCustomColumnAction(data: UpsertCustomColumnData) {
  return serializeResult(di.get(UpsertCustomColumnInteractor).invoke(data));
}

export async function getCustomColumnsByEntityTypeAction(data: GetCustomColumnsByEntityTypeData) {
  return di.get(GetCustomColumnsByEntityTypeInteractor).invoke(data);
}

export async function upsertP13nAction(data: UpsertP13nData) {
  return di.get(UpsertP13nInteractor).invoke(data);
}

export async function upsertFilterPresetAction(data: UpsertFilterPresetData) {
  return serializeResult(di.get(UpsertFilterPresetInteractor).invoke(data));
}

export async function deleteFilterPresetAction(data: DeleteFilterPresetData) {
  return di.get(DeleteFilterPresetInteractor).invoke(data);
}

export async function updateEntityCustomFieldValueAction(data: {
  entityType: EntityType;
  entityId: string;
  customFieldValues: CustomFieldValueDto[];
}) {
  const { entityType, entityId, customFieldValues } = data;

  switch (entityType) {
    case EntityType.contact:
      return serializeResult(di.get(UpdateContactInteractor).invoke({ id: entityId, customFieldValues }));
    case EntityType.organization:
      return serializeResult(di.get(UpdateOrganizationInteractor).invoke({ id: entityId, customFieldValues }));
    case EntityType.deal:
      return serializeResult(di.get(UpdateDealInteractor).invoke({ id: entityId, customFieldValues }));
    case EntityType.service:
      return serializeResult(di.get(UpdateServiceInteractor).invoke({ id: entityId, customFieldValues }));
    case EntityType.task:
      return serializeResult(di.get(UpdateTaskInteractor).invoke({ id: entityId, customFieldValues }));
  }
}

export async function bulkDeleteEntitiesAction(data: { entityType: EntityType; ids: string[] }) {
  const { entityType, ids } = data;
  switch (entityType) {
    case EntityType.contact:
      await di.get(DeleteManyContactsInteractor).invoke({ ids });
      break;
    case EntityType.organization:
      await di.get(DeleteManyOrganizationsInteractor).invoke({ ids });
      break;
    case EntityType.deal:
      await di.get(DeleteManyDealsInteractor).invoke({ ids });
      break;
    case EntityType.service:
      await di.get(DeleteManyServicesInteractor).invoke({ ids });
      break;
    case EntityType.task:
      await di.get(DeleteManyTasksInteractor).invoke({ ids });
      break;
  }
}

export async function bulkUpdateCustomFieldValuesAction(data: {
  entityType: EntityType;
  entityIds: string[];
  customFieldValues: CustomFieldValueDto[];
}) {
  const { entityType, entityIds, customFieldValues } = data;
  const items = entityIds.map((id) => ({ id, customFieldValues }));
  switch (entityType) {
    case EntityType.contact:
      await di.get(UpdateManyContactsInteractor).invoke({ contacts: items });
      break;
    case EntityType.organization:
      await di.get(UpdateManyOrganizationsInteractor).invoke({ organizations: items });
      break;
    case EntityType.deal:
      await di.get(UpdateManyDealsInteractor).invoke({ deals: items });
      break;
    case EntityType.service:
      await di.get(UpdateManyServicesInteractor).invoke({ services: items });
      break;
    case EntityType.task:
      await di.get(UpdateManyTasksInteractor).invoke({ tasks: items });
      break;
  }
}

export async function getEntityChangeHistoryByIdAction(data: GetEntityChangeHistoryByIdData) {
  return di.get(GetEntityChangeHistoryByIdInteractor).invoke(data);
}
