import type { z } from "zod";

import { createMcpHandler } from "mcp-handler";

export type McpTool = {
  name: string;
  description: string;
  annotations?: Record<string, boolean>;
  inputSchema: z.ZodType;
  execute: (...args: never[]) => Promise<string> | string;
};

export function createTextContent(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError && { isError: true }),
  };
}

export function registerAllTools(server: Parameters<Parameters<typeof createMcpHandler>[0]>[0], tools: McpTool[]) {
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
          if (typeof result === "string" && result.startsWith("Validation error:"))
            return createTextContent(result, true);
          return createTextContent(result);
        } catch (error) {
          return createTextContent(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, true);
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
