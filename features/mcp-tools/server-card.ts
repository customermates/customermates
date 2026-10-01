import { z } from "zod";

import type { McpTool } from "./mcp-tool";

import { MCP_GET_STARTED_PROMPT_INFO, MCP_SERVER_INFO } from "./server-metadata";

export function buildMcpServerCard(tools: readonly McpTool[]) {
  return {
    serverInfo: MCP_SERVER_INFO,
    authentication: { required: true, schemes: ["oauth2", "apiKey"] },
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      execution: { taskSupport: "forbidden" },
      inputSchema: z.toJSONSchema(
        tool.inputSchema instanceof z.ZodObject ? tool.inputSchema.strict() : tool.inputSchema,
        { target: "draft-07", io: "input" },
      ),
      ...(tool.outputSchema
        ? { outputSchema: z.toJSONSchema(tool.outputSchema, { target: "draft-07", io: "output" }) }
        : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    })),
    resources: [],
    prompts: [MCP_GET_STARTED_PROMPT_INFO],
  };
}
