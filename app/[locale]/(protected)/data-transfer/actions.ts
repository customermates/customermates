"use server";

import type {
  GetImportRelationIndexData,
  ImportMode,
  RelationIndexResult,
} from "@/features/data-transfer/data-transfer.schema";
import type { RowActionResult } from "@/core/utils/action-result";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { IMPORT_ENTITIES } from "@/features/data-transfer/import/import-entity.registry";
import { serializeResult, serializeRowResult } from "@/core/utils/action-result";
import {
  getCreateManyContactsInteractor,
  getCreateManyDealsInteractor,
  getCreateManyOrganizationsInteractor,
  getCreateManyServicesInteractor,
  getCreateManyTasksInteractor,
  getDryRunImportContactsInteractor,
  getDryRunImportDealsInteractor,
  getDryRunImportOrganizationsInteractor,
  getDryRunImportServicesInteractor,
  getDryRunImportTasksInteractor,
  getGetImportRelationIndexInteractor,
  getUpdateManyContactsInteractor,
  getUpdateManyDealsInteractor,
  getUpdateManyOrganizationsInteractor,
  getUpdateManyServicesInteractor,
  getUpdateManyTasksInteractor,
} from "@/core/di";

type ImportChunkInput = { entityType: EntityType; mode: ImportMode; rows: unknown[] };

type RowsInvoker = (rows: unknown[]) => Validated<Array<{ id: string }>>;

type DryRunInvoker = (data: { mode: ImportMode; rows: unknown[] }) => Validated<null>;

const UNKNOWN_ENTITY_TYPE = "Unknown entity type";

function entityTypeOrThrow(value: EntityType): EntityType {
  const parsed = z.enum(EntityType).safeParse(value);
  if (!parsed.success) throw new Error(UNKNOWN_ENTITY_TYPE);

  return parsed.data;
}

function dryRunInvoker(entityType: EntityType): DryRunInvoker {
  switch (entityType) {
    case EntityType.contact:
      return (data) => getDryRunImportContactsInteractor().invoke(data);
    case EntityType.organization:
      return (data) => getDryRunImportOrganizationsInteractor().invoke(data);
    case EntityType.deal:
      return (data) => getDryRunImportDealsInteractor().invoke(data);
    case EntityType.service:
      return (data) => getDryRunImportServicesInteractor().invoke(data);
    case EntityType.task:
      return (data) => getDryRunImportTasksInteractor().invoke(data);
  }
}

function collectionPayload<T>(entityType: EntityType, rows: unknown[]): T {
  return { [IMPORT_ENTITIES[entityType].collectionKey]: rows } as T;
}

function commitInvoker(entityType: EntityType, mode: ImportMode): RowsInvoker {
  switch (entityType) {
    case EntityType.contact:
      return (rows) =>
        mode === "create"
          ? getCreateManyContactsInteractor().invoke(collectionPayload(entityType, rows))
          : getUpdateManyContactsInteractor().invoke(collectionPayload(entityType, rows));
    case EntityType.organization:
      return (rows) =>
        mode === "create"
          ? getCreateManyOrganizationsInteractor().invoke(collectionPayload(entityType, rows))
          : getUpdateManyOrganizationsInteractor().invoke(collectionPayload(entityType, rows));
    case EntityType.deal:
      return (rows) =>
        mode === "create"
          ? getCreateManyDealsInteractor().invoke(collectionPayload(entityType, rows))
          : getUpdateManyDealsInteractor().invoke(collectionPayload(entityType, rows));
    case EntityType.service:
      return (rows) =>
        mode === "create"
          ? getCreateManyServicesInteractor().invoke(collectionPayload(entityType, rows))
          : getUpdateManyServicesInteractor().invoke(collectionPayload(entityType, rows));
    case EntityType.task:
      return (rows) =>
        mode === "create"
          ? getCreateManyTasksInteractor().invoke(collectionPayload(entityType, rows))
          : getUpdateManyTasksInteractor().invoke(collectionPayload(entityType, rows));
  }
}

export async function dryRunImportChunkAction(data: ImportChunkInput): Promise<RowActionResult> {
  const entityType = entityTypeOrThrow(data.entityType);

  return await serializeRowResult(dryRunInvoker(entityType)({ mode: data.mode, rows: data.rows }));
}

export async function commitImportChunkAction(data: ImportChunkInput): Promise<RowActionResult> {
  const entityType = entityTypeOrThrow(data.entityType);

  return await serializeRowResult(commitInvoker(entityType, data.mode)(data.rows));
}

export async function getImportRelationIndexAction(data: GetImportRelationIndexData) {
  return await serializeResult<RelationIndexResult>(getGetImportRelationIndexInteractor().invoke(data));
}
