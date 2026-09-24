import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { getGetWikiCatalogInteractor, getGetWikiPageInteractor } from "@/core/di";
import { env } from "@/env";
import { appErrorDetailsInCauseChain } from "@/core/errors/app-errors";
import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";
import { externalizeWikiPageLinks } from "@/features/wiki/wiki-markdown-links";

const RESOURCE_UNAVAILABLE = "Workspace Wiki resource is unavailable.";
class WikiResourceUnavailableError extends Error {}

async function wikiResourceBoundary<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof WikiResourceUnavailableError) && !appErrorDetailsInCauseChain(error))
      Sentry.captureException(redactUnexpectedError(error, "The Workspace Wiki MCP resource could not be read."));

    throw new Error(RESOURCE_UNAVAILABLE);
  }
}

async function wikiCatalogText(page: number) {
  const result = await getGetWikiCatalogInteractor().invoke({ page });
  if (!result.ok) throw new WikiResourceUnavailableError();
  return JSON.stringify(result.data);
}

async function wikiPageText(id: string) {
  const result = await getGetWikiPageInteractor().invoke({ id });
  if (!result.ok || !result.data) throw new WikiResourceUnavailableError();
  return externalizeWikiPageLinks(result.data.markdown, env.BASE_URL);
}

function catalogPage(value: unknown): number {
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(value ?? 1);
  if (!parsed.success) throw new WikiResourceUnavailableError();
  return parsed.data;
}

function wikiPageId(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new WikiResourceUnavailableError();
  return parsed.data;
}

export function registerWikiMcpResources(server: McpServer) {
  server.registerResource(
    "workspace-wiki-catalog",
    "customermates://wiki/catalog?page=1",
    {
      title: "Workspace Wiki catalog",
      description: "Permission-checked entry point for discovering current Workspace Wiki pages",
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
      title: "Workspace Wiki catalog page",
      description: "A paginated Workspace Wiki catalog page",
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
      title: "Workspace Wiki page",
      description: "A permission-checked Wiki page addressed by its stable UUID",
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
