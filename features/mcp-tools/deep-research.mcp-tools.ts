import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

import { customMcpFailure, formatDatesInResponse, mcpInteractorFailure, mcpMessageFailure } from "./utils";
import { getDocsPageRaw, listDocsSlugs, searchDocsRaw } from "./docs.mcp-tools";

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

type Entity = "contact" | "organization" | "deal" | "service" | "task";

const ENTITIES: Entity[] = ["contact", "organization", "deal", "service", "task"];

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
  title: z.string().describe("Display name of the record or docs page"),
  text: z.string().describe("Full content: Wiki Markdown, record fields plus notes, or product docs Markdown"),
  url: z.string().describe("Canonical app or docs URL"),
  metadata: z.record(z.string(), z.string()).optional().describe("Extra context such as entity type or locale"),
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
  const text = noteMarkdown ? `${masterText}\n\nNotes:\n${noteMarkdown}` : masterText;
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

async function fetchWiki(id: string) {
  const result = await getGetWikiPageInteractor().invoke({ id });
  if (!result.ok) return mcpInteractorFailure(result.error);
  if (!result.data) return customMcpFailure(CustomErrorCode.wikiPageNotFound);
  const page = result.data;
  const output = {
    id: `wiki:${page.id}`,
    title: page.title,
    text: page.markdown,
    url: `${env.BASE_URL}/wiki?page=${page.id}`,
    metadata: {
      source: "wiki",
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
    },
  };
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
      id: `wiki:${page.id}`,
      title: page.title,
      url: `${env.BASE_URL}/wiki?page=${page.id}`,
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
    "Find relevant Workspace Wiki pages, CRM records, and product documentation. " +
    "Use for company processes, voice, offerings, and support guidance, then fetch each relevant result. " +
    "Wiki matches are ranked by query terms with title matches weighted higher. " +
    "Compatible with ChatGPT company knowledge and deep research. For focused record or product-doc queries, prefer search_records or search_docs.",
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
      .min(2)
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
    "Returns full current content and a source URL for citations; Wiki Read is required for Wiki pages. " +
    "For bounded Wiki chunks prefer manage_wiki_pages with action=get and follow nextOffset. " +
    "Compatible with ChatGPT company knowledge and deep research.",
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
  }),
  outputSchema: FetchOutputSchema,
  execute: async ({ id }: { id: string }) => {
    const [kind, qualifier, ...rest] = id.split(":");
    const key = rest.join(":");

    if (kind === "record" && qualifier && isEntity(qualifier) && key.length > 0) return fetchRecord(qualifier, key);
    if (kind === "doc" && isContentLocale(qualifier) && key.length > 0) return fetchDoc(qualifier, key);
    if (kind === "wiki" && z.uuid().safeParse(qualifier).success && rest.length === 0) return fetchWiki(qualifier);

    return mcpMessageFailure(
      `Unknown id "${id}". Expected "record:<entity>:<id>" with entity one of contact, organization, deal, service, task, ` +
        `"wiki:<uuid>", or "doc:<locale>:<slug>" with locale ${CONTENT_LOCALES.join(" or ")}.`,
    );
  },
};
