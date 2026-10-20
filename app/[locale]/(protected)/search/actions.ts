"use server";

import type { CommandSearchInput, CommandSearchResult } from "@/features/command-palette/command-search.schema";
import type { ResolveCommandInput } from "@/features/command-palette/command-resolve";
import type {
  RecordSearch,
  RecordSearchResult,
  ResolveRecordSearchInput,
} from "@/features/records/record-search.schema";
import {
  getGetCommandCatalogInteractor,
  getResolveCommandInteractor,
  getResolveRecordSearchInteractor,
  getSearchCommandCatalogInteractor,
  getSearchRecordsInteractor,
} from "@/core/di";
import { serializeResult, settleOutcome } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";

export async function globalSearchAction(data: RecordSearch) {
  return serializeResult(getSearchRecordsInteractor().invoke(data));
}

export async function resolveSearchReferencesAction(data: ResolveRecordSearchInput) {
  return serializeResult(getResolveRecordSearchInteractor().invoke(data));
}

export async function commandCatalogAction() {
  return serializeResult(getGetCommandCatalogInteractor().invoke());
}

export async function resolveCommandAction(input: ResolveCommandInput) {
  return serializeResult(getResolveCommandInteractor().invoke(input));
}

const NO_RECORDS: RecordSearchResult = { results: [], schemaRevision: 0, nextCursor: null };

export async function commandSearchAction(input: CommandSearchInput) {
  const searchesRecords = input.scope === null || input.scope === "records";
  const records = searchesRecords
    ? await settleOutcome(
        getSearchRecordsInteractor().invoke({ searchTerm: input.searchTerm, limit: 40, cursor: null }),
      )
    : null;
  if (records && (isRedirect(records) || !records.ok)) return serializeResult<CommandSearchResult>(records);
  const recordMatched = (records?.data.results.length ?? 0) > 0;
  const catalog = await settleOutcome(
    getSearchCommandCatalogInteractor().invoke({
      ...input,
      semantic: input.semantic && !recordMatched,
    }),
  );
  if (isRedirect(catalog) || !catalog.ok) return serializeResult<CommandSearchResult>(catalog);
  const result: CommandSearchResult = { ...catalog.data, records: records?.data ?? NO_RECORDS };
  return serializeResult<CommandSearchResult>({ ok: true as const, data: result });
}
