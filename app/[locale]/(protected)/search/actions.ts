"use server";

import type { RecordSearch, ResolveRecordSearchInput } from "@/features/records/record-search.schema";
import { getSearchRecordsInteractor, getResolveRecordSearchInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function globalSearchAction(data: RecordSearch) {
  return serializeResult(getSearchRecordsInteractor().invoke(data));
}

export async function resolveSearchReferencesAction(data: ResolveRecordSearchInput) {
  return serializeResult(getResolveRecordSearchInteractor().invoke(data));
}
