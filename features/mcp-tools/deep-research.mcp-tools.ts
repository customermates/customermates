import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";
import type { WikiOutlineEntry } from "@/features/wiki/wiki-search";

import { customMcpFailure, formatDatesInResponse, mcpInteractorFailure, mcpMessageFailure } from "./utils";
import { getDocsPageRaw, listDocsSlugs, searchDocsRaw } from "./docs.mcp-tools";
import {
  UNTRUSTED_NOTES_CLOSE,
  UNTRUSTED_NOTES_HANDLING,
  UNTRUSTED_NOTES_OPEN,
  stripUntrustedNotesMarkers,
} from "./entity-generic.mcp-tools";

import { env } from "@/env";
import { CONTENT_LOCALES, DEFAULT_LOCALE, isContentLocale } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { entityListExecutors, entityNameExtractors } from "@/features/search/entity-list-executors";
import {
  getGetContactByIdInteractor,
  getGetDealByIdInteractor,
  getGetOrganizationByIdInteractor,
  getGetServiceByIdInteractor,
  getGetTaskByIdInteractor,
  getGetWikiPageInteractor,
  getSearchWikiPagesInteractor,
} from "@/core/di";
import { extractWikiPageLinks, externalizeWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { parseWikiPageReference, wikiPageFetchId, wikiPageUrl } from "@/features/wiki/wiki-links";
import { boundedWikiChunk, wikiCodePointBoundary } from "@/features/wiki/wiki-page-chunk";
import { wikiOutline, wikiSectionOffsetIn } from "@/features/wiki/wiki-search";

type Entity = "contact" | "organization" | "deal" | "service" | "task";

const ENTITIES: Entity[] = ["contact", "organization", "deal", "service", "task"];
const WIKI_FETCH_TEXT_TARGET_LENGTH = 5_500;
const WIKI_SEARCH_QUERY_MAX_LENGTH = 200;

const entityRoutes: Record<Entity, string> = {
  contact: "contacts",
  organization: "organizations",
  deal: "deals",
  service: "services",
  task: "tasks",
};

const detailsExecutors: Record<Entity, (id: string) => Promise<any>> = {
  contact: async (id) => getGetContactByIdInteractor().invoke({ id }),
  organization: async (id) => getGetOrganizationByIdInteractor().invoke({ id }),
  deal: async (id) => getGetDealByIdInteractor().invoke({ id }),
  service: async (id) => getGetServiceByIdInteractor().invoke({ id }),
  task: async (id) => getGetTaskByIdInteractor().invoke({ id }),
};

const entityNotFoundCode: Record<Entity, CustomErrorCode> = {
  contact: CustomErrorCode.contactNotFound,
  organization: CustomErrorCode.organizationNotFound,
  deal: CustomErrorCode.dealNotFound,
  service: CustomErrorCode.serviceNotFound,
  task: CustomErrorCode.taskNotFound,
};

function isEntity(value: string): value is Entity {
  return (ENTITIES as string[]).includes(value);
}

const SearchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z
        .string()
        .describe("Result id, pass to fetch: 'wiki:<uuid>', 'record:<entity>:<uuid>', or 'doc:<locale>:<slug>'"),
      title: z.string().describe("Display name of the Wiki page, record, or product docs page"),
      url: z.string().describe("Canonical app or docs URL"),
      snippet: z.string().optional().describe("Wiki excerpt around the matched terms, which are wrapped in **"),
      section: z.string().optional().describe("Heading path of the matched Wiki section"),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Pass to fetch as offset to open the Wiki page at the matched section"),
    }),
  ),
  didYouMean: z
    .array(z.string())
    .optional()
    .describe("Closest Wiki terms or titles when no Wiki page matched; search again with one"),
});

const FetchOutputSchema = z.object({
  id: z.string().describe("The canonical result id"),
  title: z.string().describe("Display name of the Wiki page, record, or docs page"),
  text: z
    .string()
    .describe("Content. Wiki results return one bounded Markdown chunk; records and product docs return full content"),
  url: z.string().describe("Canonical app or docs URL; its origin completes the relative app routes in text"),
  metadata: z.record(z.string(), z.string()).optional().describe("Extra context such as entity type or locale"),
  offset: z.number().int().nonnegative().optional().describe("Wiki chunk start offset"),
  nextOffset: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .describe("Next Wiki chunk offset, or null at the end"),
  totalChars: z.number().int().nonnegative().optional().describe("Total characters in the externalized Wiki Markdown"),
  outline: z
    .array(z.object({ level: z.number().int(), heading: z.string(), offset: z.number().int().nonnegative() }))
    .optional()
    .describe("At offset 0 of a multi-chunk Wiki page: its H1-H3 headings with the offset each starts at"),
});

async function fetchRecord(entity: Entity, key: string) {
  const result = await detailsExecutors[entity](key);
  if (!result.ok) return mcpInteractorFailure(result.error);

  const row = result.data?.[entity];
  if (!row) return customMcpFailure(entityNotFoundCode[entity]);

  const { notes, ...masterData } = row as Record<string, unknown> & { notes?: unknown };
  const noteMarkdown = notes ? serializeJSONToMarkdown(notes as object) : null;
  const masterText = JSON.stringify(formatDatesInResponse(masterData), null, 2);
  const text = noteMarkdown
    ? `${masterText}\n\nNotes:\n${UNTRUSTED_NOTES_HANDLING}\n${UNTRUSTED_NOTES_OPEN}\n${stripUntrustedNotesMarkers(noteMarkdown)}\n${UNTRUSTED_NOTES_CLOSE}`
    : masterText;
  const recordId = String(masterData.id);
  const output = {
    id: `record:${entity}:${recordId}`,
    title: entityNameExtractors[entity](row),
    text,
    url: `${env.BASE_URL}/${entityRoutes[entity]}/${recordId}`,
    metadata: { entity },
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
  const outputAt = (offset: number, end: number, outline: WikiOutlineEntry[]) => ({
    id: wikiPageFetchId(page.id),
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    metadata: {
      source: "wiki",
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      outgoingWikiLinks: JSON.stringify(
        links.slice(0, 5).map(({ id: linkedId, label, url, fetchId }) => ({
          id: linkedId,
          label,
          url,
          fetchId,
        })),
      ),
      outgoingWikiLinksTruncated: String(links.length > 5),
    },
    offset,
    nextOffset: end < markdown.length ? end : null,
    totalChars: markdown.length,
    ...(outline.length > 0 ? { outline } : {}),
    text: markdown.slice(offset, end),
  });
  const chunk = (outline: WikiOutlineEntry[]) =>
    boundedWikiChunk(
      markdown,
      requestedOffset,
      (start, stop) => JSON.stringify(outputAt(start, stop, outline)).length <= WIKI_FETCH_TEXT_TARGET_LENGTH,
      env.BASE_URL,
    );
  const plain = chunk([]);
  const outline = plain.offset === 0 && plain.end < markdown.length ? wikiOutline(markdown) : [];
  const { offset, end } = outline.length > 1 ? chunk(outline) : plain;
  const output = outputAt(offset, end, outline.length > 1 ? outline : []);
  return { text: JSON.stringify(output), structuredContent: output };
}

async function externalizedWikiOffset(id: string, offset: number) {
  if (offset === 0) return 0;
  const result = await getGetWikiPageInteractor().invoke({ id });
  if (!result.ok || !result.data) return 0;
  return wikiSectionOffsetIn(
    result.data.markdown,
    offset,
    externalizeWikiPageLinks(result.data.markdown, env.BASE_URL),
  );
}

async function searchWiki(query: string) {
  const wikiQuery = query.slice(0, wikiCodePointBoundary(query, WIKI_SEARCH_QUERY_MAX_LENGTH));
  try {
    const result = await getSearchWikiPagesInteractor().invoke({ query: wikiQuery, page: 1, pageSize: 5 });
    if (!result.ok) return { results: [], didYouMean: [] };
    const results = await Promise.all(
      result.data.items.map(async (page) => ({
        id: wikiPageFetchId(page.id),
        title: page.title,
        url: wikiPageUrl(env.BASE_URL, page.id),
        snippet: page.snippet,
        ...(page.section ? { section: page.section } : {}),
        offset: await externalizedWikiOffset(page.id, page.offset ?? 0),
      })),
    );
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
    "Required by ChatGPT company-knowledge and deep-research connectors. Returns relevant Workspace Wiki pages, CRM records, and product documentation in one list, without totals or filters. " +
    "Wiki results rank pages matching every query term first, tolerate inflections and typos, and carry a snippet with the matched terms in **, the matched section, and its offset: fetch with that offset to open at the answer, then follow linked Wiki pages. " +
    "When no Wiki page fits, search again with other words or a returned didYouMean. " +
    "For focused CRM or product-doc queries prefer search_records or list_records, which carry totals and filters, or search_docs. " +
    "App routes in the docs text that fetch returns, such as `/company/subscription`, are relative: for a full link, put the route after the origin of the result's url; that origin is the instance's configured BASE_URL.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe("Search terms for workspace Wiki content, CRM record names, and product documentation"),
  }),
  outputSchema: SearchOutputSchema,
  execute: async ({ query }: { query: string }) => {
    const [recordGroups, wiki] = await Promise.all([
      Promise.all(
        ENTITIES.map(async (entity) => {
          try {
            const result = await entityListExecutors[entity]({
              searchTerm: query,
              pagination: { page: 1, pageSize: 5 },
            });
            if (!result.ok) return [];
            return result.data.items.slice(0, 3).map((item: any) => ({
              id: `record:${entity}:${item.id}`,
              title: entityNameExtractors[entity](item),
              url: `${env.BASE_URL}/${entityRoutes[entity]}/${item.id}`,
            }));
          } catch (error) {
            if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return [];
            throw error;
          }
        }),
      ),
      searchWiki(query),
    ]);

    const docResults = searchDocsRaw(query, DEFAULT_LOCALE, "docs")
      .results.slice(0, 3)
      .map((hit) => ({ id: `doc:${DEFAULT_LOCALE}:${hit.slug}`, title: hit.title, url: hit.url }));

    const output = {
      results: [...wiki.results, ...recordGroups.flat(), ...docResults],
      ...(wiki.didYouMean.length > 0 ? { didYouMean: wiki.didYouMean } : {}),
    };

    return { text: JSON.stringify(output), structuredContent: output };
  },
};

export const fetchTool = {
  name: "fetch",
  title: "Read workspace knowledge",
  description:
    "Read a result from search, including Workspace Wiki Markdown by wiki:<uuid>. " +
    "Wiki pages may also be fetched by their exact relative, localized, or same-origin absolute Wiki URL. " +
    "Wiki content is returned in bounded chunks with absolute internal links and a source URL for citations; pass nextOffset back as offset until it is null. If updatedAt differs from the previous chunk, restart at offset 0. Wiki Read is required for Wiki pages. " +
    "Start at a search result's offset to land on the matched section; at offset 0 a multi-chunk page also returns an outline of its headings with their offsets. " +
    "Compatible with ChatGPT company knowledge and deep research. For focused CRM or product-documentation retrieval, prefer get_records or get_docs_page. " +
    "For a docs result, app routes in text, such as `/company/subscription`, are relative: for a full link, put the route after the origin of url; that origin is the instance's configured BASE_URL.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    id: z
      .string()
      .min(1)
      .describe("A result id returned by search: 'wiki:<uuid>', 'record:<entity>:<id>', or 'doc:<locale>:<slug>'"),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("For Wiki results, the offset from search or the nextOffset from the previous fetch; start at 0"),
  }),
  outputSchema: FetchOutputSchema,
  execute: async ({ id, offset = 0 }: { id: string; offset?: number }) => {
    const wikiReference = parseWikiPageReference(id, env.BASE_URL);
    if (wikiReference) return fetchWiki(wikiReference.id, offset);

    const [kind, qualifier, ...rest] = id.split(":");
    const key = rest.join(":");
    if (offset !== 0) return mcpMessageFailure("offset is supported only for Workspace Wiki results.");

    if (kind === "record" && qualifier && isEntity(qualifier) && key.length > 0) return fetchRecord(qualifier, key);
    if (kind === "doc" && isContentLocale(qualifier) && key.length > 0) return fetchDoc(qualifier, key);
    return mcpMessageFailure(
      `Unknown id "${id}". Expected "record:<entity>:<id>" with entity one of contact, organization, deal, service, task, ` +
        `"wiki:<uuid>" or an exact Customermates Wiki URL, or "doc:<locale>:<slug>" with locale ${CONTENT_LOCALES.join(" or ")}.`,
    );
  },
};
