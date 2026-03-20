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
import { serializeResult } from "@/core/utils/action-result";

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
