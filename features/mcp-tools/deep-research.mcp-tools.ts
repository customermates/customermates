import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";
import type { WikiOutlineEntry } from "@/features/wiki/wiki-markdown-sections";

import { customMcpFailure, mcpInteractorFailure, mcpMessageFailure } from "./utils";
import { getDocsPageRaw, listDocsSlugs, searchDocsHits } from "./docs.mcp-tools";
import {
  UNTRUSTED_NOTES_CLOSE,
  UNTRUSTED_NOTES_HANDLING,
  UNTRUSTED_NOTES_OPEN,
  stripUntrustedNotesMarkers,
} from "./untrusted-record-content";

import { env } from "@/env";
import { CONTENT_LOCALES, DEFAULT_LOCALE, isContentLocale } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import {
  getGetRecordInteractor,
  getGetRecordModelInteractor,
  getSearchRecordsInteractor,
  getGetWikiPageInteractor,
  getSearchExternalizedWikiPagesInteractor,
} from "@/core/di";
import { RecordRefSchema, type RecordRef } from "@/features/records/record-model.schema";
import { recordSearchLabel } from "@/features/records/record-search.schema";
import { extractWikiPageLinks, externalizeWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { parseWikiPageReference, wikiPageFetchId, wikiPageUrl } from "@/features/wiki/wiki-links";
import { boundedWikiChunk, WIKI_CHUNK_SIZE_FAILURE, wikiCodePointBoundary } from "@/features/wiki/wiki-page-chunk";
import { wikiOutline } from "@/features/wiki/wiki-markdown-sections";

const WIKI_FETCH_TEXT_TARGET_LENGTH = 5_500;
const WIKI_SEARCH_QUERY_MAX_LENGTH = 200;

const SearchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z
        .string()
        .describe("Result id, pass to fetch: 'wiki:<uuid>', 'record:<typeId>:<recordId>', or 'doc:<locale>:<slug>'"),
      title: z.string().describe("Display name of the Knowledge Base page, record, or product docs page"),
      url: z.string().describe("Canonical app or docs URL"),
      snippet: z
        .string()
        .optional()
        .describe("Knowledge Base excerpt around the matched terms, which are wrapped in **"),
      section: z.string().optional().describe("Heading path of the matched Knowledge Base section"),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Pass to fetch as offset to open the Knowledge Base page at the matched section"),
    }),
  ),
  didYouMean: z
    .array(z.string())
    .optional()
    .describe(
      "The corrected query the Knowledge Base results were found with, when a misspelled word matched no Knowledge Base page",
    ),
});

const FetchOutputSchema = z.object({
  id: z.string().describe("The canonical result id"),
  title: z.string().describe("Display name of the Knowledge Base page, record, or docs page"),
  text: z
    .string()
    .describe(
      "Content. Knowledge Base results return one bounded Markdown chunk; records and product docs return full content",
    ),
  url: z.string().describe("Canonical app or docs URL; its origin completes the relative app routes in text"),
  metadata: z.record(z.string(), z.string()).optional().describe("Extra context such as entity type or locale"),
  offset: z.number().int().nonnegative().optional().describe("Knowledge Base chunk start offset"),
  nextOffset: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .describe("Next Knowledge Base chunk offset, or null at the end"),
  totalChars: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Total characters in the externalized Knowledge Base Markdown"),
  outlineTruncated: z.boolean().optional().describe("Some headings were omitted to keep the response bounded."),
  outline: z
    .array(
      z.object({
        level: z.number().int(),
        heading: z.string(),
        offset: z.number().int().nonnegative(),
      }),
    )
    .optional()
    .describe("At offset 0 of a multi-chunk Knowledge Base page: its H1-H3 headings with the offset each starts at"),
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
    metadata: { typeId: ref.typeId },
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

async function fetchWiki(id: string, requestedOffset: number) {
  const result = await getGetWikiPageInteractor().invoke({ id });
  if (!result.ok) return mcpInteractorFailure(result.error);
  if (!result.data) return customMcpFailure(CustomErrorCode.wikiPageNotFound);
  const page = result.data;
  const links = extractWikiPageLinks(page.markdown, env.BASE_URL, 6);
  const markdown = externalizeWikiPageLinks(page.markdown, env.BASE_URL);
  let selectedLinks = links.slice(0, 5);
  let outlineTruncated = false;
  const outputAt = (offset: number, end: number, outline: WikiOutlineEntry[]) => ({
    id: wikiPageFetchId(page.id),
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    metadata: {
      source: "wiki",
      kind: page.kind,
      ...(page.whenToUse ? { whenToUse: page.whenToUse } : {}),
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      outgoingWikiLinks: JSON.stringify(
        selectedLinks.map(({ id: linkedId, label, url, fetchId }) => ({
          id: linkedId,
          label,
          url,
          fetchId,
        })),
      ),
      outgoingWikiLinksTruncated: String(links.length > selectedLinks.length),
    },
    offset,
    nextOffset: end < markdown.length ? end : null,
    totalChars: markdown.length,
    ...(outline.length > 0 ? { outline } : {}),
    ...(outlineTruncated ? { outlineTruncated: true } : {}),
    text: markdown.slice(offset, end),
  });
  const chunk = (outline: WikiOutlineEntry[]) =>
    boundedWikiChunk(
      markdown,
      requestedOffset,
      (start, stop) => JSON.stringify(outputAt(start, stop, outline)).length <= WIKI_FETCH_TEXT_TARGET_LENGTH,
      env.BASE_URL,
    );
  while (
    selectedLinks.length &&
    JSON.stringify(outputAt(requestedOffset, requestedOffset, [])).length > WIKI_FETCH_TEXT_TARGET_LENGTH - 2_000
  )
    selectedLinks = selectedLinks.slice(0, -1);
  const plain = chunk([]);
  if (!plain) return mcpMessageFailure(WIKI_CHUNK_SIZE_FAILURE);
  const headings = plain.offset === 0 && plain.end < markdown.length ? wikiOutline(markdown) : [];
  const outline: WikiOutlineEntry[] = [];
  for (const heading of headings) {
    if (
      JSON.stringify(outputAt(plain.offset, plain.offset, [...outline, heading])).length >
      WIKI_FETCH_TEXT_TARGET_LENGTH - 2_000
    )
      break;
    outline.push(heading);
  }
  outlineTruncated = outline.length < headings.length;
  const selected = outline.length > 0 ? chunk(outline) : plain;
  if (!selected) return mcpMessageFailure(WIKI_CHUNK_SIZE_FAILURE);
  const { offset, end } = selected;
  const output = outputAt(offset, end, outline);
  return { text: JSON.stringify(output), structuredContent: output };
}

async function searchWiki(query: string) {
  const wikiQuery = query.slice(0, wikiCodePointBoundary(query, WIKI_SEARCH_QUERY_MAX_LENGTH));
  try {
    const result = await getSearchExternalizedWikiPagesInteractor().invoke({
      query: wikiQuery,
      page: 1,
      pageSize: 5,
    });
    if (!result.ok) return { results: [], didYouMean: [] };
    const results = result.data.items.map((page) => ({
      id: wikiPageFetchId(page.id),
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, page.id),
      snippet: page.snippet,
      ...(page.kind !== "knowledge" ? { kind: page.kind } : {}),
      ...(page.whenToUse ? { whenToUse: page.whenToUse } : {}),
      ...(page.section ? { section: page.section } : {}),
      offset: page.offset ?? 0,
    }));
    return { results, didYouMean: result.data.didYouMean ?? [] };
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied)
      return { results: [], didYouMean: [] };
    throw error;
  }
}

export const searchTool = {
  name: "search",
  title: "Search workspace knowledge",
  description:
    "Required by ChatGPT company-knowledge and deep-research connectors. Returns relevant Knowledge Base pages, CRM records, and product documentation in one list, without totals or filters. " +
    "Knowledge Base results match the query's words in full text and, with AI credits, also by meaning, and carry a snippet with the matched terms in **, the matched section, and its offset: fetch with that offset to open at the answer, then follow linked Knowledge Base pages. " +
    "A misspelled word that matches no Knowledge Base page is corrected from the Knowledge Base's own words, and didYouMean names the corrected query; when no Knowledge Base page fits, search again with other words. " +
    "For focused CRM or product-doc queries prefer search_crm_records or query_crm_records, query_crm_measure for totals, or search_docs. " +
    "Links into the app in the docs are full URLs on this instance and open the reader's own workspace; pass them on unchanged.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  inputSchema: z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe("Search terms for workspace Knowledge Base content, CRM record names, and product documentation"),
  }),
  outputSchema: SearchOutputSchema,
  execute: async ({ query }: { query: string }) => {
    const recordQuery = query.slice(0, wikiCodePointBoundary(query, WIKI_SEARCH_QUERY_MAX_LENGTH));
    const [recordResults, wiki, docHits] = await Promise.all([
      getSearchRecordsInteractor()
        .invoke({ searchTerm: recordQuery, limit: 15, cursor: null })
        .then((records) =>
          records.ok
            ? records.data.results.map((item) => ({
                id: `record:${item.ref.typeId}:${item.ref.recordId}`,
                title: recordSearchLabel(item, (key) =>
                  key === "RecordModel.restricted" ? "Restricted value" : "Calculation error",
                ),
                url: `${env.BASE_URL}/records/${item.ref.typeId}/${item.ref.recordId}`,
              }))
            : [],
        )
        .catch((error: unknown) => {
          if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return [];
          throw error;
        }),
      searchWiki(query),
      searchDocsHits(query, DEFAULT_LOCALE, "docs"),
    ]);

    const docResults = docHits.slice(0, 3).map((hit) => ({
      id: `doc:${DEFAULT_LOCALE}:${hit.slug}`,
      title: hit.title,
      url: hit.url,
    }));

    const output = {
      results: [...wiki.results, ...recordResults, ...docResults],
      ...(wiki.didYouMean.length > 0 ? { didYouMean: wiki.didYouMean } : {}),
    };

    return { text: JSON.stringify(output), structuredContent: output };
  },
};

export const fetchTool = {
  name: "fetch",
  title: "Read workspace knowledge",
  description:
    "Read a result from search, including Knowledge Base Markdown by wiki:<uuid>. " +
    "Knowledge Base pages may also be fetched by their exact relative, localized, or same-origin absolute Knowledge Base URL. " +
    "Knowledge Base content is returned in bounded chunks with absolute internal links and a source URL for citations; pass nextOffset back as offset until it is null. If updatedAt differs from the previous chunk, restart at offset 0. Knowledge Base Read is required for Knowledge Base pages. " +
    "Start at a search result's offset to land on the matched section; at offset 0 a multi-chunk page also returns an outline of its headings with their offsets. " +
    "Compatible with ChatGPT company knowledge and deep research. For focused CRM or product-documentation retrieval, prefer read_crm_record or get_docs_page. " +
    "Links into the app in the docs are full URLs on this instance and open the reader's own workspace; pass them on unchanged.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  inputSchema: z.object({
    id: z
      .string()
      .min(1)
      .describe(
        "A result id returned by search: 'wiki:<uuid>', 'record:<typeId>:<recordId>', or 'doc:<locale>:<slug>'",
      ),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe(
        "For Knowledge Base results, the offset from search or the nextOffset from the previous fetch; start at 0",
      ),
  }),
  outputSchema: FetchOutputSchema,
  execute: async ({ id, offset = 0 }: { id: string; offset?: number }) => {
    const wikiReference = parseWikiPageReference(id, env.BASE_URL);
    if (wikiReference) return fetchWiki(wikiReference.id, offset);

    const [kind, qualifier, ...rest] = id.split(":");
    const key = rest.join(":");
    if (offset !== 0) return mcpMessageFailure("offset is supported only for Knowledge Base results.");

    if (kind === "record") {
      const ref = RecordRefSchema.safeParse({ typeId: qualifier, recordId: key });
      if (ref.success) return fetchRecord(ref.data);
    }
    if (kind === "doc" && isContentLocale(qualifier) && key.length > 0) return fetchDoc(qualifier, key);
    return mcpMessageFailure(
      `Unknown id "${id}". Expected "record:<typeId>:<recordId>" with two UUIDs, ` +
        `"wiki:<uuid>" or an exact Customermates Knowledge Base URL, or "doc:<locale>:<slug>" with locale ${CONTENT_LOCALES.join(" or ")}.`,
    );
  },
};
