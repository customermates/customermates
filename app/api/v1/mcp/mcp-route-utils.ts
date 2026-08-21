import { z } from "zod";

import { createMcpHandler } from "mcp-handler";
import * as Sentry from "@sentry/nextjs";

import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";
import { executeMcpTool, type McpTool } from "@/features/mcp-tools/mcp-tool";
import { GET_STARTED_PROMPT, MCP_SERVER_INSTRUCTIONS } from "@/features/mcp-tools/server-instructions";
import { env } from "@/env";

export type { McpTool, McpToolResult } from "@/features/mcp-tools/mcp-tool";

function createTextContent(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError && { isError: true }),
  };
}

function strictInputSchema(inputSchema: z.ZodType): z.ZodType {
  return inputSchema instanceof z.ZodObject ? inputSchema.strict() : inputSchema;
}

function registerAllTools(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0], tools: McpTool[]) {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: strictInputSchema(tool.inputSchema),
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        annotations: tool.annotations,
      },
      async (...args: unknown[]) => {
        try {
          const result = await executeMcpTool(tool, args);
          if (!result.ok) {
            return {
              ...createTextContent(result.result, true),
              _meta: { failure: result.failure },
            };
          }
          return {
            ...createTextContent(result.result),
            ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
          };
        } catch (error) {
          Sentry.captureException(redactUnexpectedError(error, "The MCP tool could not be completed."));
          return createTextContent("Error: The operation could not be completed", true);
        }
      },
    );
  }
}

function registerPrompts(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0]) {
  server.registerPrompt(
    "get-started",
    {
      title: "Get started",
      description: "Personalized CRM kickoff: interview the user, then summarize the workspace",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: GET_STARTED_PROMPT },
        },
      ],
    }),
  );
}

function unauthorizedChallenge() {
  const resourceMetadataUrl = `${env.BASE_URL}/.well-known/oauth-protected-resource`;

  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function isMcpRequestAuthorized(request: Request): Promise<boolean> {
  if (request.headers.has("x-api-key")) return true;

  const hasBearer = (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  if (!hasBearer) return false;

  const { getAuthService } = await import("@/core/di");

  return getAuthService().isMcpBearerValid(request.headers);
}

function resolveToolsetKey(request: Request, knownKeys: string[]): string {
  const raw = new URL(request.url).searchParams.get("toolsets");
  if (!raw) return "";

  const requested = raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => knownKeys.includes(key));

  if (requested.length === 0) return "";

  return [...new Set(requested)].sort().join(",");
}

export function createMcpRoute(
  toolGroups: Record<string, McpTool[]>,
  alwaysOn: McpTool[] = [],
  endpoint = "/api/v1/mcp",
) {
  const knownKeys = Object.keys(toolGroups);
  const handlers = new Map<string, (request: Request) => Promise<Response>>();

  function handlerFor(toolsetKey: string) {
    const existing = handlers.get(toolsetKey);
    if (existing) return existing;

    const activeKeys = toolsetKey === "" ? knownKeys : toolsetKey.split(",");
    const tools = [...activeKeys.flatMap((key) => toolGroups[key]), ...alwaysOn];
    const handler = createMcpHandler(
      (server) => {
        registerAllTools(server, tools);
        registerPrompts(server);
      },
      { instructions: MCP_SERVER_INSTRUCTIONS },
      { streamableHttpEndpoint: endpoint },
    );
    handlers.set(toolsetKey, handler);
    return handler;
  }

  return async (request: Request) => {
    if (!(await isMcpRequestAuthorized(request))) return unauthorizedChallenge();

    return handlerFor(resolveToolsetKey(request, knownKeys))(request);
  };
}
