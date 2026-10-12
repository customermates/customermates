import { z } from "zod";

import { createMcpHandler } from "mcp-handler";
import * as Sentry from "@sentry/nextjs";

import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";
import { executeMcpTool, type McpTool } from "@/features/mcp-tools/mcp-tool";
import { buildMcpServerInstructions, GET_STARTED_PROMPT } from "@/features/mcp-tools/server-instructions";
import { mcpToolsForToolsets } from "@/features/mcp-tools/toolsets";
import { env } from "@/env";
import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";

export type { McpTool, McpToolResult } from "@/features/mcp-tools/mcp-tool";

const UNEXPECTED_FAILURE_MESSAGE = "The operation could not be completed because of an unexpected server error.";

const UNEXPECTED_FAILURE: SerializedInteractorFailure = {
  kind: "unavailable",
  issues: [{ code: "custom", path: [], message: UNEXPECTED_FAILURE_MESSAGE }],
};

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
          return {
            ...createTextContent(`Error: ${UNEXPECTED_FAILURE_MESSAGE}`, true),
            _meta: { failure: UNEXPECTED_FAILURE },
          };
        }
      },
    );
  }
}

type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

function registerPrompts(server: McpServer, tools: McpTool[]) {
  const names = new Set(tools.map((tool) => tool.name));
  if (!names.has("get_workspace_context") || !names.has("discover_record_types")) return;
  server.registerPrompt(
    "get-started",
    {
      title: "Get started",
      description: "Personalized CRM kickoff: read the workspace and Knowledge Base, then ask what to focus on",
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
  const hasApiKey = request.headers.has("x-api-key");
  const hasBearer = (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  if (!hasApiKey && !hasBearer) return false;

  const { getAuthService } = await import("@/core/di");

  return hasApiKey
    ? getAuthService().isMcpApiKeyValid(request.headers)
    : getAuthService().isMcpBearerValid(request.headers);
}

function insufficientPermissions() {
  return new Response(
    JSON.stringify({
      error: "insufficient_permissions",
      message:
        "Connecting through MCP requires Read access All on API & Webhooks for your role. Ask a workspace administrator to grant it.",
      requiredPermission: { resource: "api", action: "readAll" },
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    },
  );
}

async function mcpAccessRefusal(): Promise<Response | null> {
  const { getAuthorizeMcpConnectionInteractor } = await import("@/core/di");
  try {
    await getAuthorizeMcpConnectionInteractor().invoke();
    return null;
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedChallenge();
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied)
      return insufficientPermissions();
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
}

function resolveToolsetKey(request: Request, knownKeys: string[]): { key: string } | { unknown: string[] } {
  const raw = new URL(request.url).searchParams.get("toolsets");
  if (!raw) return { key: "" };

  const requested = raw
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const unknown = requested.filter((key) => !knownKeys.includes(key));
  if (unknown.length) return { unknown };
  if (requested.length === 0) return { key: "" };

  return { key: [...new Set(requested)].sort().join(",") };
}

function unknownToolsets(unknown: string[], knownKeys: string[]) {
  return new Response(
    JSON.stringify({
      error: "invalid_toolsets",
      message: `Unknown toolsets: ${unknown.join(", ")}. Valid toolsets: ${knownKeys.join(", ")}.`,
      unknown,
      validToolsets: knownKeys,
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    },
  );
}

export function createMcpRoute(
  toolGroups: Record<string, McpTool[]>,
  alwaysOn: McpTool[] = [],
  endpoint = "/api/v1/mcp",
  registerFeatures?: (server: McpServer, tools: McpTool[]) => void,
) {
  const knownKeys = Object.keys(toolGroups);
  const handlers = new Map<string, (request: Request) => Promise<Response>>();

  function handlerFor(toolsetKey: string) {
    const existing = handlers.get(toolsetKey);
    if (existing) return existing;

    const activeKeys = toolsetKey === "" ? knownKeys : toolsetKey.split(",");
    const tools = mcpToolsForToolsets(toolGroups, activeKeys, alwaysOn);
    const handler = createMcpHandler(
      (server) => {
        registerAllTools(server, tools);
        registerPrompts(server, tools);
        registerFeatures?.(server, tools);
      },
      {
        instructions: buildMcpServerInstructions(tools.map((tool) => tool.name)),
      },
      { streamableHttpEndpoint: endpoint },
    );
    handlers.set(toolsetKey, handler);
    return handler;
  }

  return async (request: Request) => {
    if (!(await isMcpRequestAuthorized(request))) return unauthorizedChallenge();
    const refused = await mcpAccessRefusal();
    if (refused) return refused;
    const toolsets = resolveToolsetKey(request, knownKeys);
    if ("unknown" in toolsets) return unknownToolsets(toolsets.unknown, knownKeys);
    return handlerFor(toolsets.key)(request);
  };
}
