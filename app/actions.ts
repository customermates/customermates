"use server";

import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { ImportMode } from "@/features/data-transfer/data-transfer.schema";
import type { UpsertCustomColumnData } from "@/features/custom-column/upsert-custom-column.interactor";
import type { GetCustomColumnsByEntityTypeData } from "@/features/custom-column/get-custom-columns-by-entity-type.interactor";
import type { GetP13nData } from "@/features/p13n/get-p13n.interactor";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type { UpsertFilterPresetData } from "@/features/p13n/upsert-filter-preset.interactor";
import type { DeleteFilterPresetData } from "@/features/p13n/delete-filter-preset.interactor";

import { EntityType } from "@/generated/prisma";

import { serializeInteractorFailure } from "@/core/validation/validation.utils";

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
  getCreateManyContactsInteractor,
  getCreateManyOrganizationsInteractor,
  getCreateManyDealsInteractor,
  getCreateManyServicesInteractor,
  getCreateManyTasksInteractor,
  getDryRunImportContactsInteractor,
  getDryRunImportOrganizationsInteractor,
  getDryRunImportDealsInteractor,
  getDryRunImportServicesInteractor,
  getDryRunImportTasksInteractor,
  getExportContactsPageInteractor,
  getExportOrganizationsPageInteractor,
  getExportDealsPageInteractor,
  getExportServicesPageInteractor,
  getExportTasksPageInteractor,
  getDeleteManyTasksInteractor,
  getGetP13nInteractor,
  getUpsertP13nInteractor,
  getUpsertFilterPresetInteractor,
  getDeleteFilterPresetInteractor,
  getGetCompanySettingsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function deleteCustomColumnAction(id: string) {
  return serializeResult(getDeleteCustomColumnInteractor().invoke({ id }));
}

export async function getCompanySettingsAction() {
  return serializeResult(getGetCompanySettingsInteractor().invoke());
}

export async function upsertCustomColumnAction(data: UpsertCustomColumnData) {
  return serializeResult(getUpsertCustomColumnInteractor().invoke(data));
}

export async function getCustomColumnsByEntityTypeAction(data: GetCustomColumnsByEntityTypeData) {
  const result = await getGetCustomColumnsByEntityTypeInteractor().invoke(data);
  return result.ok ? result.data : [];
}

export async function upsertP13nAction(data: UpsertP13nData) {
  return serializeResult(getUpsertP13nInteractor().invoke(data));
}

export async function getP13nAction(data: GetP13nData) {
  return serializeResult(getGetP13nInteractor().invoke(data));
}

export async function upsertFilterPresetAction(data: UpsertFilterPresetData) {
  return serializeResult(getUpsertFilterPresetInteractor().invoke(data));
}

export async function deleteFilterPresetAction(data: DeleteFilterPresetData) {
  return serializeResult(getDeleteFilterPresetInteractor().invoke(data));
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

function importCollectionKey(entityType: EntityType): string {
  switch (entityType) {
    case EntityType.contact:
      return "contacts";
    case EntityType.organization:
      return "organizations";
    case EntityType.deal:
      return "deals";
    case EntityType.service:
      return "services";
    case EntityType.task:
      return "tasks";
  }
}

function dryRunInteractor(entityType: EntityType) {
  switch (entityType) {
    case EntityType.contact:
      return getDryRunImportContactsInteractor();
    case EntityType.organization:
      return getDryRunImportOrganizationsInteractor();
    case EntityType.deal:
      return getDryRunImportDealsInteractor();
    case EntityType.service:
      return getDryRunImportServicesInteractor();
    case EntityType.task:
      return getDryRunImportTasksInteractor();
  }
}

function commitInvoker(entityType: EntityType, mode: ImportMode) {
  const key = importCollectionKey(entityType);

  switch (entityType) {
    case EntityType.contact:
      return (rows: unknown[]) =>
        mode === "create"
          ? getCreateManyContactsInteractor().invoke({ [key]: rows } as never)
          : getUpdateManyContactsInteractor().invoke({ [key]: rows } as never);
    case EntityType.organization:
      return (rows: unknown[]) =>
        mode === "create"
          ? getCreateManyOrganizationsInteractor().invoke({ [key]: rows } as never)
          : getUpdateManyOrganizationsInteractor().invoke({ [key]: rows } as never);
    case EntityType.deal:
      return (rows: unknown[]) =>
        mode === "create"
          ? getCreateManyDealsInteractor().invoke({ [key]: rows } as never)
          : getUpdateManyDealsInteractor().invoke({ [key]: rows } as never);
    case EntityType.service:
      return (rows: unknown[]) =>
        mode === "create"
          ? getCreateManyServicesInteractor().invoke({ [key]: rows } as never)
          : getUpdateManyServicesInteractor().invoke({ [key]: rows } as never);
    case EntityType.task:
      return (rows: unknown[]) =>
        mode === "create"
          ? getCreateManyTasksInteractor().invoke({ [key]: rows } as never)
          : getUpdateManyTasksInteractor().invoke({ [key]: rows } as never);
  }
}

export async function dryRunImportChunkAction(data: { entityType: EntityType; mode: ImportMode; rows: unknown[] }) {
  const result = await dryRunInteractor(data.entityType).invoke({ mode: data.mode, rows: data.rows });

  return result.ok
    ? { ok: true as const, ids: [] as string[] }
    : { ok: false as const, failure: serializeInteractorFailure(result.error) };
}

export async function commitImportChunkAction(data: { entityType: EntityType; mode: ImportMode; rows: unknown[] }) {
  const result = await commitInvoker(data.entityType, data.mode)(data.rows);

  return result.ok
    ? { ok: true as const, ids: result.data.map((record: { id: string }) => record.id) }
    : { ok: false as const, failure: serializeInteractorFailure(result.error) };
}

const RELATION_INDEX_LIMIT = 5000;

const RELATION_PAGE_SIZE = 500;

function relationInvoker(entityType: EntityType) {
  switch (entityType) {
    case EntityType.contact:
      return getExportContactsPageInteractor();
    case EntityType.organization:
      return getExportOrganizationsPageInteractor();
    case EntityType.deal:
      return getExportDealsPageInteractor();
    case EntityType.service:
      return getExportServicesPageInteractor();
    case EntityType.task:
      return getExportTasksPageInteractor();
  }
}

function relationLabel(record: { name?: string; firstName?: string; lastName?: string }): string {
  return record.name ?? `${record.firstName ?? ""} ${record.lastName ?? ""}`.trim();
}

export async function getImportRelationIndexAction(data: { entityTypes: EntityType[] }) {
  const index: Record<string, Array<[string, string]>> = {};

  for (const entityType of data.entityTypes) {
    const interactor = relationInvoker(entityType);
    const entries: Array<[string, string]> = [];
    let truncated = false;

    for (let skip = 0; skip < RELATION_INDEX_LIMIT; skip += RELATION_PAGE_SIZE) {
      const page = await interactor.invoke({
        entityType,
        columns: [{ key: "name", header: "name" }],
        skip,
        take: RELATION_PAGE_SIZE,
      });

      if (!page.ok) break;

      for (const record of page.data.rows) entries.push([relationLabel(record).toLocaleLowerCase(), record.id]);

      if (page.data.rows.length < RELATION_PAGE_SIZE) break;
      if (skip + RELATION_PAGE_SIZE >= RELATION_INDEX_LIMIT) truncated = page.data.total > entries.length;
    }

    index[entityType] = entries;
    if (truncated) index[`${entityType}:truncated`] = [];
  }

  return { ok: true as const, index };
}
