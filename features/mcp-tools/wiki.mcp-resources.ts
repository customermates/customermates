import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { getGetWikiCatalogInteractor, getGetWikiPageInteractor } from "@/core/di";
import { env } from "@/env";
import { appErrorDetailsInCauseChain } from "@/core/errors/app-errors";
import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";
import { externalizeWikiPageLinks } from "@/features/wiki/wiki-markdown-links";

const RESOURCE_UNAVAILABLE = "Knowledge Base resource is unavailable.";

async function wikiResourceBoundary<T>(read: () => Promise<T | null>): Promise<T> {
  let result: T | null;
  try {
    result = await read();
  } catch (error) {
    if (!appErrorDetailsInCauseChain(error))
      Sentry.captureException(redactUnexpectedError(error, "The Knowledge Base MCP resource could not be read."));
    throw new Error(RESOURCE_UNAVAILABLE);
  }
  if (result === null) throw new Error(RESOURCE_UNAVAILABLE);
  return result;
}

async function wikiCatalogText(page: number | null) {
  if (page === null) return null;
  const result = await getGetWikiCatalogInteractor().invoke({ page });
  if (!result.ok) return null;
  return JSON.stringify(result.data);
}

async function wikiPageText(id: string | null) {
  if (id === null) return null;
  const result = await getGetWikiPageInteractor().invoke({ id });
  if (!result.ok || !result.data) return null;
  return externalizeWikiPageLinks(result.data.markdown, env.BASE_URL);
}

function catalogPage(value: unknown): number | null {
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(value ?? 1);
  if (!parsed.success) return null;
  return parsed.data;
}

function wikiPageId(value: unknown): string | null {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

export function registerWikiMcpResources(server: McpServer) {
  server.registerResource(
    "workspace-wiki-catalog",
    "customermates://wiki/catalog?page=1",
    {
      title: "Knowledge Base catalog",
      description:
        "Permission-checked entry point: the Operating Guide, the procedure index with when-to-use triggers, and the first knowledge catalog page",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: await wikiResourceBoundary(() => wikiCatalogText(1)),
        },
      ],
    }),
  );

  server.registerResource(
    "workspace-wiki-catalog-page",
    new ResourceTemplate("customermates://wiki/catalog{?page}", {
      list: undefined,
    }),
    {
      title: "Knowledge Base catalog page",
      description: "A paginated Knowledge Base catalog page",
      mimeType: "application/json",
    },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: await wikiResourceBoundary(() => wikiCatalogText(catalogPage(variables.page))),
        },
      ],
    }),
  );

  server.registerResource(
    "workspace-wiki-page",
    new ResourceTemplate("customermates://wiki/page/{id}", { list: undefined }),
    {
      title: "Knowledge Base page",
      description: "A permission-checked Knowledge Base page addressed by its stable UUID",
      mimeType: "text/markdown",
    },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await wikiResourceBoundary(() => wikiPageText(wikiPageId(variables.id))),
        },
      ],
    }),
  );
}
