import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

import { customMcpFailure, formatDatesInResponse, mcpInteractorFailure, mcpMessageFailure } from "./utils";
import { getDocsPageRaw, listDocsSlugs, searchDocsRaw } from "./docs.mcp-tools";

import { env } from "@/env";
import { CONTENT_LOCALES, DEFAULT_LOCALE, isContentLocale } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { entityListExecutors, entityNameExtractors } from "@/features/search/entity-list-executors";
import {
  getGetContactByIdInteractor,
  getGetDealByIdInteractor,
  getGetOrganizationByIdInteractor,
  getGetServiceByIdInteractor,
  getGetTaskByIdInteractor,
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
      id: z.string().describe("Result id, pass to fetch: 'record:<entity>:<uuid>' or 'doc:<locale>:<slug>'"),
      title: z.string().describe("Display name of the record or docs page"),
      url: z.string().describe("Canonical app or docs URL"),
    }),
  ),
});

const FetchOutputSchema = z.object({
  id: z.string().describe("The canonical result id"),
  title: z.string().describe("Display name of the record or docs page"),
  text: z.string().describe("Full content: record fields plus notes, or the docs page markdown"),
  url: z.string().describe("Canonical app or docs URL"),
  metadata: z.record(z.string(), z.string()).optional().describe("Extra context such as entity type or locale"),
});

async function fetchRecord(entity: Entity, key: string) {
  const result = await detailsExecutors[entity](key);
  if (!result.ok) return mcpInteractorFailure(result.error);

  const row = result.data?.[entity];
  if (!row) return customMcpFailure(entityNotFoundCode[entity]);

  const { notes, ...masterData } = row as Record<string, unknown> & { notes?: unknown };
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

export const searchTool = {
  name: "search",
  title: "Search (deep research)",
  description:
    "Required by ChatGPT deep research connectors. Interactive agents should prefer search_records or search_docs.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    query: z.string().min(2).describe("Free-text query matched against CRM record names and the documentation"),
  }),
  outputSchema: SearchOutputSchema,
  execute: async ({ query }: { query: string }) => {
    const recordGroups = await Promise.all(
      ENTITIES.map(async (entity) => {
        const result = await entityListExecutors[entity]({ searchTerm: query, pagination: { page: 1, pageSize: 5 } });
        if (!result.ok) return [];
        return result.data.items.slice(0, 3).map((item: any) => ({
          id: `record:${entity}:${item.id}`,
          title: entityNameExtractors[entity](item),
          url: `${env.BASE_URL}/${entityRoutes[entity]}/${item.id}`,
        }));
      }),
    );

    const docResults = searchDocsRaw(query, DEFAULT_LOCALE, "docs")
      .results.slice(0, 3)
      .map((hit) => ({ id: `doc:${DEFAULT_LOCALE}:${hit.slug}`, title: hit.title, url: hit.url }));

    const output = { results: [...recordGroups.flat(), ...docResults] };

    return { text: JSON.stringify(output), structuredContent: output };
  },
};

export const fetchTool = {
  name: "fetch",
  title: "Fetch (deep research)",
  description:
    "Required by ChatGPT deep research connectors. Interactive agents should prefer get_records or get_docs_page.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    id: z
      .string()
      .min(1)
      .describe("A result id returned by search, either 'record:<entity>:<id>' or 'doc:<locale>:<slug>'"),
  }),
  outputSchema: FetchOutputSchema,
  execute: async ({ id }: { id: string }) => {
    const [kind, qualifier, ...rest] = id.split(":");
    const key = rest.join(":");

    if (kind === "record" && qualifier && isEntity(qualifier) && key.length > 0) return fetchRecord(qualifier, key);
    if (kind === "doc" && isContentLocale(qualifier) && key.length > 0) return fetchDoc(qualifier, key);

    return mcpMessageFailure(
      `Unknown id "${id}". Expected "record:<entity>:<id>" with entity one of contact, organization, deal, service, task, ` +
        `or "doc:<locale>:<slug>" with locale ${CONTENT_LOCALES.join(" or ")}.`,
    );
  },
};
