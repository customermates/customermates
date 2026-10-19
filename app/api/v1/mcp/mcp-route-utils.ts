import { z } from "zod";

import { createMcpHandler } from "mcp-handler";
import * as Sentry from "@sentry/nextjs";

import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";
import { executeMcpTool, type McpTool } from "@/features/mcp-tools/mcp-tool";
import { buildMcpServerInstructions, GET_STARTED_PROMPT } from "@/features/mcp-tools/server-instructions";
import { mcpToolsForToolsets } from "@/features/mcp-tools/toolsets";
import { env } from "@/env";
import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { EmailVerificationRequiredError } from "@/core/auth/email-verification-required-error";
import { WorkspacePlanRequiredError } from "@/core/auth/workspace-plan-required-error";
import { MCP_ENDPOINT_PATH, mcpProtectedResourceMetadataUrl } from "@/features/auth/mcp-resource";
import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";

export type { McpTool, McpToolResult } from "@/features/mcp-tools/mcp-tool";

const UNEXPECTED_FAILURE_MESSAGE = "The operation could not be completed because of an unexpected server error.";
const FOREIGN_TOKEN_MESSAGE = "The access token belongs to another workspace. Connect again through this MCP URL.";
const FOREIGN_API_KEY_MESSAGE =
  "This API key belongs to another workspace. Use the MCP URL of that workspace, or create an API key in this one.";

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

const strictInputSchemas = new WeakMap<z.ZodType, z.ZodType>();

function strictInputSchema(inputSchema: z.ZodType): z.ZodType {
  const cached = strictInputSchemas.get(inputSchema);
  if (cached) return cached;
  const strict = inputSchema instanceof z.ZodObject ? inputSchema.strict() : inputSchema;
  strictInputSchemas.set(inputSchema, strict);
  return strict;
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

function unauthorizedChallenge(resourceMetadataUrl: string) {
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

function foreignTokenChallenge(resourceMetadataUrl: string) {
  return new Response(JSON.stringify({ error: "invalid_token", message: FOREIGN_TOKEN_MESSAGE }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer error="invalid_token", error_description="${FOREIGN_TOKEN_MESSAGE}", resource_metadata="${resourceMetadataUrl}"`,
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function foreignApiKey() {
  return new Response(JSON.stringify({ error: "workspace_mismatch", message: FOREIGN_API_KEY_MESSAGE }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function credentialHeaders(request: Request): { apiKey: boolean; bearer: boolean } {
  return {
    apiKey: request.headers.has("x-api-key"),
    bearer: (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer "),
  };
}

async function isMcpRequestAuthorized(request: Request): Promise<boolean> {
  const { apiKey: hasApiKey, bearer: hasBearer } = credentialHeaders(request);
  if (!hasApiKey && !hasBearer) return false;

  const { getAuthService } = await import("@/core/di");

  return hasApiKey
    ? getAuthService().isMcpApiKeyValid(request.headers)
    : getAuthService().isMcpBearerValid(request.headers);
}

async function workspaceCredentialRefusal(
  request: Request,
  workspaceId: string,
  resourceMetadataUrl: string,
): Promise<Response | null> {
  const { apiKey, bearer } = credentialHeaders(request);
  if (!apiKey && !bearer) return unauthorizedChallenge(resourceMetadataUrl);

  const { getAuthService } = await import("@/core/di");
  const bound = await getAuthService().resolveMcpCredentialWorkspace(request.headers);
  if (!bound) return unauthorizedChallenge(resourceMetadataUrl);
  if (bound.companyId === workspaceId) return null;

  return bound.credential === "bearer" ? foreignTokenChallenge(resourceMetadataUrl) : foreignApiKey();
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

function planRequired(message: string) {
  return new Response(JSON.stringify({ error: "plan_required", message }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function inactiveUser(message: string) {
  return new Response(JSON.stringify({ error: "inactive_user", message }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function emailNotVerified(message: string) {
  return new Response(JSON.stringify({ error: "email_not_verified", message }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function mcpAccessRefusal(resourceMetadataUrl: string): Promise<Response | null> {
  const { getAuthorizeMcpConnectionInteractor } = await import("@/core/di");
  try {
    await getAuthorizeMcpConnectionInteractor().invoke();
    return null;
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedChallenge(resourceMetadataUrl);
    if (error instanceof WorkspacePlanRequiredError) return planRequired(error.message);
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied)
      return insufficientPermissions();
    if (error instanceof EmailVerificationRequiredError) return emailNotVerified(error.message);
    if (error instanceof ForbiddenError && error.code === AppErrorCode.inactiveUser) return inactiveUser(error.message);
    throw error;
  }
}

async function isOperatorRequest(operatorTools: McpTool[]): Promise<boolean> {
  if (operatorTools.length === 0) return false;
  const { getOperatorAccessService } = await import("@/core/di");

  return getOperatorAccessService().isReadEligible();
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

async function atEndpoint(request: Request, endpoint: string): Promise<Request> {
  const url = new URL(request.url);
  url.pathname = endpoint;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  return new Request(url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
  });
}

export function createMcpRoute(
  toolGroups: Record<string, McpTool[]>,
  alwaysOn: McpTool[] = [],
  endpoint = MCP_ENDPOINT_PATH,
  registerFeatures?: (server: McpServer, tools: McpTool[]) => void,
  operatorTools: McpTool[] = [],
) {
  const knownKeys = Object.keys(toolGroups);
  const toolsets = new Map<string, { tools: McpTool[]; instructions: string }>();

  function toolsetFor(toolsetKey: string, operator: boolean) {
    const cacheKey = operator ? `${toolsetKey}#operator` : toolsetKey;
    const existing = toolsets.get(cacheKey);
    if (existing) return existing;

    const activeKeys = toolsetKey === "" ? knownKeys : toolsetKey.split(",");
    const tools = [...mcpToolsForToolsets(toolGroups, activeKeys, alwaysOn), ...(operator ? operatorTools : [])];
    const toolset = { tools, instructions: buildMcpServerInstructions(tools.map((tool) => tool.name)) };
    toolsets.set(cacheKey, toolset);
    return toolset;
  }

  function handlerFor(toolsetKey: string, operator: boolean) {
    const { tools, instructions } = toolsetFor(toolsetKey, operator);
    return createMcpHandler(
      (server) => {
        registerAllTools(server, tools);
        registerPrompts(server, tools);
        registerFeatures?.(server, tools);
      },
      { serverInfo: { name: "Customermates", version: "1.0.0" }, instructions },
      { streamableHttpEndpoint: endpoint },
    );
  }

  return async (request: Request, workspaceId?: string) => {
    const resourceMetadataUrl = mcpProtectedResourceMetadataUrl(env.BASE_URL, workspaceId);
    if (workspaceId) {
      const foreign = await workspaceCredentialRefusal(request, workspaceId, resourceMetadataUrl);
      if (foreign) return foreign;
    } else if (!(await isMcpRequestAuthorized(request))) return unauthorizedChallenge(resourceMetadataUrl);
    const refused = await mcpAccessRefusal(resourceMetadataUrl);
    if (refused) return refused;
    const toolsets = resolveToolsetKey(request, knownKeys);
    if ("unknown" in toolsets) return unknownToolsets(toolsets.unknown, knownKeys);
    const operator = await isOperatorRequest(operatorTools);
    return handlerFor(toolsets.key, operator)(workspaceId ? await atEndpoint(request, endpoint) : request);
  };
}
