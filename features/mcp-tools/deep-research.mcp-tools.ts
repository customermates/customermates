import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

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
import { unwrapValidated } from "@/core/validation/validation.utils";
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
import { wikiCodePointBoundary, wikiMarkdownChunk } from "@/features/wiki/wiki-page-chunk";

type Entity = "contact" | "organization" | "deal" | "service" | "task";

const ENTITIES: Entity[] = ["contact", "organization", "deal", "service", "task"];
const WIKI_FETCH_TEXT_TARGET_LENGTH = 5_500;

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
    }),
  ),
});

const FetchOutputSchema = z.object({
  id: z.string().describe("The canonical result id"),
  title: z.string().describe("Display name of the Wiki page, record, or docs page"),
  text: z
    .string()
    .describe("Content. Wiki results return one bounded Markdown chunk; records and product docs return full content"),
  url: z.string().describe("Canonical app or docs URL"),
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
});

async function fetchRecord(entity: Entity, key: string) {
  const result = await detailsExecutors[entity](key);
  if (!result.ok) return mcpInteractorFailure(result.error);

  const row = result.data?.[entity];
  if (!row) return customMcpFailure(entityNotFoundCode[entity]);

  const { notes, ...masterData } = row as Record<string, unknown> & {
    notes?: unknown;
  };
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
  const offset = wikiMarkdownChunk(markdown, requestedOffset, 0, env.BASE_URL).offset;
  const base = {
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
    nextOffset: null as number | null,
    totalChars: markdown.length,
  };
  const outputAt = (end: number) => ({
    ...base,
    text: markdown.slice(offset, end),
    nextOffset: end < markdown.length ? end : null,
  });

  let low = offset;
  let high = markdown.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (JSON.stringify(outputAt(middle)).length <= WIKI_FETCH_TEXT_TARGET_LENGTH) low = middle;
    else high = middle - 1;
  }

  const safe = wikiMarkdownChunk(markdown, offset, Math.max(0, low - offset), env.BASE_URL);
  const safeOutput = outputAt(safe.nextOffset ?? safe.totalChars);
  const output =
    JSON.stringify(safeOutput).length <= WIKI_FETCH_TEXT_TARGET_LENGTH
      ? safeOutput
      : outputAt(wikiCodePointBoundary(markdown, low));
  return { text: JSON.stringify(output), structuredContent: output };
}

async function searchWiki(query: string) {
  try {
    const result = await unwrapValidated(
      getSearchWikiPagesInteractor().invoke({
        query,
        page: 1,
        pageSize: 5,
      }),
    );
    return result.items.map((page) => ({
      id: wikiPageFetchId(page.id),
      title: page.title,
      url: wikiPageUrl(env.BASE_URL, page.id),
    }));
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return [];
    throw error;
  }
}

export const searchTool = {
  name: "search",
  title: "Search workspace knowledge",
  description:
    "Required by ChatGPT company-knowledge and deep-research connectors. Returns relevant Workspace Wiki pages, CRM records, and product documentation in one list, without totals or filters. " +
    "Fetch every relevant Wiki result and follow its linked Wiki pages. Wiki matches are ranked by query terms with title matches weighted higher. " +
    "For focused CRM or product-doc queries prefer search_records or list_records, which carry totals and filters, or search_docs.",
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
      .max(200)
      .describe("Search terms for workspace Wiki content, CRM record names, and product documentation"),
  }),
  outputSchema: SearchOutputSchema,
  execute: async ({ query }: { query: string }) => {
    const [recordGroups, wikiResults] = await Promise.all([
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
      .map((hit) => ({
        id: `doc:${DEFAULT_LOCALE}:${hit.slug}`,
        title: hit.title,
        url: hit.url,
      }));

    const output = {
      results: [...wikiResults, ...recordGroups.flat(), ...docResults],
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
    "Wiki content is returned in bounded chunks with absolute internal links and a source URL for citations; pass nextOffset back as offset until it is null. Wiki Read is required for Wiki pages. " +
    "Compatible with ChatGPT company knowledge and deep research. For focused CRM or product-documentation retrieval, prefer get_records or get_docs_page.",
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
      .describe("A result id returned by search: 'wiki:<uuid>', 'record:<entity>:<id>', or 'doc:<locale>:<slug>'"),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("For Wiki results, the nextOffset from the previous fetch; start at 0"),
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
