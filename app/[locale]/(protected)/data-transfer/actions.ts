"use server";

import type {
  GetImportRelationIndexData,
  ImportChunkData,
  RelationIndexResult,
} from "@/features/data-transfer/data-transfer.schema";
import type { RowActionResult } from "@/core/utils/action-result";

import { serializeResult, serializeRowResult } from "@/core/utils/action-result";
import { retireLegacyRecordWrite } from "@/features/records/retire-legacy-write";
import {
  getCommitImportChunkInteractor,
  getDryRunImportChunkInteractor,
  getGetImportRelationIndexInteractor,
} from "@/core/di";

export async function dryRunImportChunkAction(data: ImportChunkData): Promise<RowActionResult> {
  retireLegacyRecordWrite();
  return await serializeRowResult(getDryRunImportChunkInteractor().invoke(data));
}

export async function commitImportChunkAction(data: ImportChunkData): Promise<RowActionResult> {
  retireLegacyRecordWrite();
  return await serializeRowResult(getCommitImportChunkInteractor().invoke(data));
}

export async function getImportRelationIndexAction(data: GetImportRelationIndexData) {
  return await serializeResult<RelationIndexResult>(getGetImportRelationIndexInteractor().invoke(data));
}
