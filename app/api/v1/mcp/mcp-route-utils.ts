import { z } from "zod";

import { createMcpHandler } from "mcp-handler";
import * as Sentry from "@sentry/nextjs";

import { validationError, VALIDATION_ERROR_PREFIX } from "@/features/mcp-tools/utils";
import { GET_STARTED_PROMPT, MCP_SERVER_INSTRUCTIONS } from "@/features/mcp-tools/server-instructions";
import { prismaClientError } from "@/core/errors/prisma-client-error";
import { env } from "@/env";

function toClientError(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string" && /^P2\d{3}$/.test(code)) return "The operation could not be completed";
  return error instanceof Error ? error.message : "Unknown error";
}

export type McpToolResult = string | { text: string; structuredContent: Record<string, unknown> };

export type McpTool = {
  name: string;
  title: string;
  description: string;
  annotations?: Record<string, boolean>;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  execute: (...args: never[]) => Promise<McpToolResult> | McpToolResult;
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
          const result = await (tool.execute as (...a: unknown[]) => Promise<McpToolResult> | McpToolResult)(...args);
          if (typeof result === "string") {
            if (result.startsWith(VALIDATION_ERROR_PREFIX)) return createTextContent(result, true);
            return createTextContent(result);
          }
          return { ...createTextContent(result.text), structuredContent: result.structuredContent };
        } catch (error) {
          if (error instanceof z.ZodError) return createTextContent(validationError(error), true);
          const prismaError = prismaClientError(error);
          if (prismaError) return createTextContent(`Error: ${prismaError.message}`, true);
          Sentry.captureException(error);
          return createTextContent(`Error: ${toClientError(error)}`, true);
        }
      },
    );
  }
}

function registerPrompts(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0]) {
  server.registerPrompt(
    "get-started",
    { title: "Get started", description: "Personalized CRM kickoff: interview the user, then summarize the workspace" },
    () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: GET_STARTED_PROMPT } }],
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
