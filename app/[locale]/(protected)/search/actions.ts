"use server";

import type { CommandSearchInput, CommandSearchResult } from "@/features/command-palette/command-search.schema";
import type {
  RecordSearch,
  RecordSearchResult,
  ResolveRecordSearchInput,
} from "@/features/records/record-search.schema";
import {
  getGetCommandCatalogInteractor,
  getResolveRecordSearchInteractor,
  getSearchCommandCatalogInteractor,
  getSearchRecordsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function globalSearchAction(data: RecordSearch) {
  return serializeResult(getSearchRecordsInteractor().invoke(data));
}

export async function resolveSearchReferencesAction(data: ResolveRecordSearchInput) {
  return serializeResult(getResolveRecordSearchInteractor().invoke(data));
}

export async function commandCatalogAction() {
  return serializeResult(getGetCommandCatalogInteractor().invoke());
}

const NO_RECORDS: RecordSearchResult = { results: [], schemaRevision: 0, nextCursor: null };

export async function commandSearchAction(input: CommandSearchInput) {
  const searchesRecords = input.scope === null || input.scope === "records";
  const [records, catalog] = await Promise.all([
    searchesRecords
      ? getSearchRecordsInteractor().invoke({ searchTerm: input.searchTerm, limit: 40, cursor: null })
      : null,
    getSearchCommandCatalogInteractor().invoke(input),
  ]);
  if (records && !records.ok) return serializeResult(records);
  if (!catalog.ok) return serializeResult(catalog);
  const result: CommandSearchResult = { ...catalog.data, records: records?.data ?? NO_RECORDS };
  return serializeResult<CommandSearchResult>({ ok: true as const, data: result });
}
