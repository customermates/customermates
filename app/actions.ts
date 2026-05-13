"use server";

import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { UpsertCustomColumnData } from "@/features/custom-column/upsert-custom-column.interactor";
import type { GetCustomColumnsByEntityTypeData } from "@/features/custom-column/get-custom-columns-by-entity-type.interactor";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type { UpsertFilterPresetData } from "@/features/p13n/upsert-filter-preset.interactor";
import type { DeleteFilterPresetData } from "@/features/p13n/delete-filter-preset.interactor";

import { EntityType } from "@/generated/prisma";

import {
  getUpsertCustomColumnInteractor,
  getDeleteCustomColumnInteractor,
  getGetCustomColumnsByEntityTypeInteractor,
  getUpdateContactInteractor,
  getUpdateManyContactsInteractor,
  getDeleteManyContactsInteractor,
  getUpdateOrganizationInteractor,
  getUpdateManyOrganizationsInteractor,
  getDeleteManyOrganizationsInteractor,
  getUpdateDealInteractor,
  getUpdateManyDealsInteractor,
  getDeleteManyDealsInteractor,
  getUpdateServiceInteractor,
  getUpdateManyServicesInteractor,
  getDeleteManyServicesInteractor,
  getUpdateTaskInteractor,
  getUpdateManyTasksInteractor,
  getDeleteManyTasksInteractor,
  getGetEntityChangeHistoryByIdInteractor,
  getUpsertP13nInteractor,
  getUpsertFilterPresetInteractor,
  getDeleteFilterPresetInteractor,
} from "@/core/app-di";
import { serializeResult } from "@/core/utils/action-result";
import { type GetEntityChangeHistoryByIdData } from "@/ee/audit-log/get/get-entity-change-history-by-id.interactor";

export async function deleteCustomColumnAction(id: string) {
  const result = await getDeleteCustomColumnInteractor().invoke({ id });
  return result.data;
}

export async function upsertCustomColumnAction(data: UpsertCustomColumnData) {
  return serializeResult(getUpsertCustomColumnInteractor().invoke(data));
}

export async function getCustomColumnsByEntityTypeAction(data: GetCustomColumnsByEntityTypeData) {
  const result = await getGetCustomColumnsByEntityTypeInteractor().invoke(data);
  return result.data;
}

export async function upsertP13nAction(data: UpsertP13nData) {
  return getUpsertP13nInteractor().invoke(data);
}

export async function upsertFilterPresetAction(data: UpsertFilterPresetData) {
  return serializeResult(getUpsertFilterPresetInteractor().invoke(data));
}

export async function deleteFilterPresetAction(data: DeleteFilterPresetData) {
  return getDeleteFilterPresetInteractor().invoke(data);
}

export async function updateEntityCustomFieldValueAction(data: {
  entityType: EntityType;
  entityId: string;
  customFieldValues: CustomFieldValueDto[];
}) {
  const { entityType, entityId, customFieldValues } = data;

  switch (entityType) {
    case EntityType.contact:
      return serializeResult(getUpdateContactInteractor().invoke({ id: entityId, customFieldValues }));
    case EntityType.organization:
      return serializeResult(getUpdateOrganizationInteractor().invoke({ id: entityId, customFieldValues }));
    case EntityType.deal:
      return serializeResult(getUpdateDealInteractor().invoke({ id: entityId, customFieldValues }));
    case EntityType.service:
      return serializeResult(getUpdateServiceInteractor().invoke({ id: entityId, customFieldValues }));
    case EntityType.task:
      return serializeResult(getUpdateTaskInteractor().invoke({ id: entityId, customFieldValues }));
  }
}

export async function bulkDeleteEntitiesAction(data: { entityType: EntityType; ids: string[] }) {
  const { entityType, ids } = data;
  switch (entityType) {
    case EntityType.contact:
      return serializeResult(getDeleteManyContactsInteractor().invoke({ ids }));
    case EntityType.organization:
      return serializeResult(getDeleteManyOrganizationsInteractor().invoke({ ids }));
    case EntityType.deal:
      return serializeResult(getDeleteManyDealsInteractor().invoke({ ids }));
    case EntityType.service:
      return serializeResult(getDeleteManyServicesInteractor().invoke({ ids }));
    case EntityType.task:
      return serializeResult(getDeleteManyTasksInteractor().invoke({ ids }));
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
      return serializeResult(getUpdateManyContactsInteractor().invoke({ contacts: items }));
    case EntityType.organization:
      return serializeResult(getUpdateManyOrganizationsInteractor().invoke({ organizations: items }));
    case EntityType.deal:
      return serializeResult(getUpdateManyDealsInteractor().invoke({ deals: items }));
    case EntityType.service:
      return serializeResult(getUpdateManyServicesInteractor().invoke({ services: items }));
    case EntityType.task:
      return serializeResult(getUpdateManyTasksInteractor().invoke({ tasks: items }));
  }
}

export async function getEntityChangeHistoryByIdAction(data: GetEntityChangeHistoryByIdData) {
  const result = await getGetEntityChangeHistoryByIdInteractor().invoke(data);
  return result.data;
}
