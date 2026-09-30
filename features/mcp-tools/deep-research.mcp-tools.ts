import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

import { customMcpFailure, mcpInteractorFailure, mcpMessageFailure } from "./utils";
import { getDocsPageRaw, listDocsSlugs, searchDocsRaw } from "./docs.mcp-tools";
import {
  UNTRUSTED_NOTES_CLOSE,
  UNTRUSTED_NOTES_HANDLING,
  UNTRUSTED_NOTES_OPEN,
  stripUntrustedNotesMarkers,
} from "./untrusted-record-content";

import { env } from "@/env";
import { CONTENT_LOCALES, DEFAULT_LOCALE, isContentLocale } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import {
  getGetRecordInteractor,
  getGetRecordModelInteractor,
  getSearchRecordsInteractor,
  getResolveRecordSearchInteractor,
} from "@/core/di";
import { RecordRefSchema, type RecordRef } from "@/features/records/record-model.schema";
import { LegacySearchReferenceSchema } from "@/features/search/legacy-search-reference";
import { recordSearchLabel } from "@/features/records/record-search.schema";

const SearchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("Result id, pass to fetch: 'record:<typeId>:<recordId>' or 'doc:<locale>:<slug>'"),
      title: z.string().describe("Display name of the record or docs page"),
      url: z.string().describe("Canonical app or docs URL"),
    }),
  ),
});

const FetchOutputSchema = z.object({
  id: z.string().describe("The canonical result id"),
  title: z.string().describe("Display name of the record or docs page"),
  text: z.string().describe("Full content: record fields plus notes, or the docs page markdown"),
  url: z.string().describe("Canonical app or docs URL; its origin completes the relative app routes in text"),
  metadata: z.record(z.string(), z.string()).optional().describe("Extra context such as entity type or locale"),
});

async function fetchRecord(ref: RecordRef) {
  const [result, configuration] = await Promise.all([
    getGetRecordInteractor().invoke(ref),
    getGetRecordModelInteractor().invoke({ typeIds: [ref.typeId] }),
  ]);
  if (!result.ok) return mcpInteractorFailure(result.error);
  if (!configuration.ok) return mcpInteractorFailure(configuration.error);
  if (result.data.schemaRevision !== configuration.data.revision)
    return customMcpFailure(CustomErrorCode.recordSchemaChanged);
  const record = result.data;
  const type = configuration.data.types.find((item) => item.id === ref.typeId);
  if (!type) return customMcpFailure(CustomErrorCode.recordNotFound);
  const title = recordSearchLabel(
    {
      ref,
      title: record.fields.find((field) => field.fieldId === type.primaryFieldId)?.result ?? { state: "missing" },
      typeLabel: type.label,
      typePluralLabel: type.pluralLabel,
      icon: type.icon,
      pictureUrl: null,
    },
    (key) => (key === "RecordModel.restricted" ? "Restricted value" : "Calculation error"),
  );
  const documents: string[] = [];
  const fields = record.fields.map((field) => {
    if (field.result.state !== "value" || field.result.value.kind !== "richText") return field;
    const markdown = serializeJSONToMarkdown(JSON.parse(field.result.value.documentJson));
    documents.push(
      `Field ${field.fieldId}:\n${UNTRUSTED_NOTES_OPEN}\n${stripUntrustedNotesMarkers(markdown)}\n${UNTRUSTED_NOTES_CLOSE}`,
    );
    return { fieldId: field.fieldId, result: { state: "value", format: "markdown below" } };
  });
  const text = [
    JSON.stringify({ ...record, fields }, null, 2),
    ...(documents.length ? [UNTRUSTED_NOTES_HANDLING, ...documents] : []),
  ].join("\n\n");
  const output = {
    id: `record:${ref.typeId}:${ref.recordId}`,
    title,
    text,
    url: `${env.BASE_URL}/records/${ref.typeId}/${ref.recordId}`,
    metadata: { typeId: ref.typeId, contractVersion: "2" },
  };
  return { text: JSON.stringify(output), structuredContent: output };
}

function fetchDoc(locale: ContentLocale, slug: string) {
  const page = getDocsPageRaw(slug, locale, "docs");
  if (!page) {
    const validSlugs = listDocsSlugs(locale, "docs").join(", ");
    return mcpMessageFailure(`Unknown docs page "${slug}" for locale "${locale}". Valid slugs: ${validSlugs}`);
  }

  const output = {
    id: `doc:${locale}:${page.slug}`,
    title: page.title,
    text: page.markdown,
    url: page.url,
    metadata: { locale, source: "docs", description: page.description },
  };

  return { text: JSON.stringify(output), structuredContent: output };
}

export const searchTool = {
  name: "search",
  title: "Search (deep research)",
  description:
    "Required by ChatGPT deep research connectors: it returns records and documentation pages mixed in one list, with no total and no filters. " +
    "Do not use it to answer a question about the workspace: prefer search_crm_records or query_crm_records, query_crm_measure for totals, and search_docs for documentation. " +
    "App routes in the docs text that fetch returns, such as `/company/subscription`, are relative: for a full link, put the route after the origin of the result's url; that origin is the instance's configured BASE_URL.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .describe("Free-text query matched against CRM record names and the documentation"),
  }),
  outputSchema: SearchOutputSchema,
  execute: async ({ query }: { query: string }) => {
    const records = await getSearchRecordsInteractor().invoke({ searchTerm: query, limit: 15, cursor: null });
    if (!records.ok) return mcpInteractorFailure(records.error);
    const recordResults = records.data.results.map((item) => ({
      id: `record:${item.ref.typeId}:${item.ref.recordId}`,
      title: recordSearchLabel(item, (key) =>
        key === "RecordModel.restricted" ? "Restricted value" : "Calculation error",
      ),
      url: `${env.BASE_URL}/records/${item.ref.typeId}/${item.ref.recordId}`,
    }));

    const docResults = searchDocsRaw(query, DEFAULT_LOCALE, "docs")
      .results.slice(0, 3)
      .map((hit) => ({ id: `doc:${DEFAULT_LOCALE}:${hit.slug}`, title: hit.title, url: hit.url }));

    const output = { results: [...recordResults, ...docResults] };

    return { text: JSON.stringify(output), structuredContent: output };
  },
};

export const fetchTool = {
  name: "fetch",
  title: "Fetch (deep research)",
  description:
    "Required by ChatGPT deep research connectors. Interactive agents should prefer read_crm_record or get_docs_page. " +
    "For a docs result, app routes in text, such as `/company/subscription`, are relative: for a full link, put the route after the origin of url; that origin is the instance's configured BASE_URL.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    id: z
      .string()
      .min(1)
      .describe("A result id returned by search, either 'record:<typeId>:<recordId>' or 'doc:<locale>:<slug>'"),
  }),
  outputSchema: FetchOutputSchema,
  execute: async ({ id }: { id: string }) => {
    const [kind, qualifier, ...rest] = id.split(":");
    const key = rest.join(":");

    if (kind === "record") {
      const ref = RecordRefSchema.safeParse({ typeId: qualifier, recordId: key });
      if (ref.success) return fetchRecord(ref.data);
      const legacy = LegacySearchReferenceSchema.safeParse({ type: qualifier, id: key });
      if (legacy.success) {
        const resolved = await getResolveRecordSearchInteractor().invoke({ refs: [legacy.data] });
        if (!resolved.ok) return mcpInteractorFailure(resolved.error);
        const match = resolved.data.results[0];
        return match ? fetchRecord(match.ref) : customMcpFailure(CustomErrorCode.recordNotFound);
      }
    }
    if (kind === "doc" && isContentLocale(qualifier) && key.length > 0) return fetchDoc(qualifier, key);

    return mcpMessageFailure(
      `Unknown id "${id}". Expected "record:<typeId>:<recordId>" with two UUIDs, ` +
        `or "doc:<locale>:<slug>" with locale ${CONTENT_LOCALES.join(" or ")}.`,
    );
  },
};
