import type { McpTool } from "./mcp-tool";

import { z } from "zod";

export const MCP_WORKSPACE_ARGUMENT = "workspace";

const WorkspaceArgumentSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe(
    "Slug or id of the workspace to work in. Optional when the account has exactly one usable workspace; required when it has several. An API key always works in its own workspace.",
  );

const inputSchemas = new WeakMap<McpTool, z.ZodType>();

export function mcpToolInputSchema(tool: McpTool): z.ZodType {
  const cached = inputSchemas.get(tool);
  if (cached) return cached;
  const { inputSchema } = tool;
  const schema = !(inputSchema instanceof z.ZodObject)
    ? inputSchema
    : tool.scope === "account"
      ? inputSchema.strict()
      : inputSchema.extend({ [MCP_WORKSPACE_ARGUMENT]: WorkspaceArgumentSchema }).strict();
  inputSchemas.set(tool, schema);
  return schema;
}

export function withoutWorkspaceArgument(args: unknown[]): unknown[] {
  const [input, ...rest] = args;
  if (!input || typeof input !== "object" || !(MCP_WORKSPACE_ARGUMENT in input)) return args;
  return [Object.fromEntries(Object.entries(input).filter(([key]) => key !== MCP_WORKSPACE_ARGUMENT)), ...rest];
}
