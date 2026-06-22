import { z } from "zod";

import { createMcpHandler } from "mcp-handler";
import * as Sentry from "@sentry/nextjs";

import { validationError, VALIDATION_ERROR_PREFIX } from "@/features/mcp-tools/utils";
import { prismaClientError } from "@/core/errors/prisma-client-error";

function toClientError(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string" && /^P2\d{3}$/.test(code)) return "The operation could not be completed";
  return error instanceof Error ? error.message : "Unknown error";
}

export type McpTool = {
  name: string;
  description: string;
  annotations?: Record<string, boolean>;
  inputSchema: z.ZodType;
  execute: (...args: never[]) => Promise<string> | string;
};

function createTextContent(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError && { isError: true }),
  };
}

function registerAllTools(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0], tools: McpTool[]) {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (...args: unknown[]) => {
        try {
          const result = await (tool.execute as (...a: unknown[]) => Promise<string> | string)(...args);
          if (typeof result === "string" && result.startsWith(VALIDATION_ERROR_PREFIX))
            return createTextContent(result, true);
          return createTextContent(result);
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

export function createMcpRoute(tools: McpTool[], endpoint = "/api/v1/mcp") {
  return createMcpHandler(
    (server) => {
      registerAllTools(server, tools);
    },
    {},
    { streamableHttpEndpoint: endpoint },
  );
}
