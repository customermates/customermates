import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";
import type { FlexibleSchema, ToolSet } from "ai";

import { jsonSchema, tool } from "ai";
import { z } from "zod";

/**
 * Anthropic requires every tool's input_schema to be a JSON Schema with a
 * top-level `type: "object"`. Most MCP tools are `z.object(...)` and satisfy this,
 * but a few (e.g. upsert_custom_column) are discriminated unions, which serialize
 * to a bare `anyOf` with no top-level type and get rejected (HTTP 400). For those
 * we emit a sanitized JSON Schema with `type: "object"` added; object-schema tools
 * keep their Zod schema so AI-SDK validation, coercion, and defaults are preserved.
 */
function resolveInputSchema(zodSchema: z.ZodType): FlexibleSchema<unknown> {
  let json: Record<string, any> | undefined;
  try {
    json = z.toJSONSchema(zodSchema, { unrepresentable: "any" }) as Record<string, any>;
  } catch {
    return zodSchema;
  }

  const composition = json?.anyOf ?? json?.oneOf ?? json?.allOf;

  // Clean object schemas keep their Zod schema (AI-SDK validation, coercion, defaults).
  if (json && json.type === "object" && !composition) return zodSchema;

  // Anthropic rejects anyOf/oneOf/allOf anywhere in input_schema, so a discriminated
  // union (e.g. upsert_custom_column) must be flattened into one permissive object
  // that merges the branches' field names. The interactor's own @Validate still
  // enforces the true (discriminated) schema when the tool runs.
  const branches: Array<Record<string, any>> = Array.isArray(composition) ? composition : [];
  const properties: Record<string, unknown> = {};
  for (const branch of branches) for (const key of Object.keys(branch?.properties ?? {})) properties[key] = {};

  return jsonSchema({
    type: "object",
    properties,
    additionalProperties: true,
    ...(typeof json?.description === "string" ? { description: json.description } : {}),
  } as Parameters<typeof jsonSchema>[0]);
}

/**
 * A tool requires explicit human approval when it is destructive (e.g. delete)
 * or has real external side effects (e.g. sending an email / chat message). We
 * read this straight off the MCP tool annotations so the agent's gate stays in
 * lockstep with the MCP contract instead of a hand-maintained name list.
 */
export function toolNeedsApproval(mcpTool: Pick<McpTool, "annotations">): boolean {
  return Boolean(mcpTool.annotations?.destructiveHint || mcpTool.annotations?.openWorldHint);
}

async function runMcpTool(mcpTool: McpTool, input: unknown): Promise<string> {
  try {
    return await (mcpTool.execute as (arg: unknown) => Promise<string> | string)(input);
  } catch (error) {
    // Mirror the MCP route's behaviour: surface a readable error to the model as
    // tool output rather than throwing and aborting the whole run.
    return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

/**
 * Convert a list of MCP tool definitions into an AI SDK tool set. Gated tools are
 * marked `needsApproval` unless the user has pre-authorized them, in which case
 * they run without a confirmation card. Every tool is still exposed to the agent.
 */
export function buildAgentToolsFrom(mcpTools: McpTool[], options: { preAuthorizedToolNames: string[] }): ToolSet {
  const preAuthorized = new Set(options.preAuthorizedToolNames);
  const tools: ToolSet = {};

  for (const mcpTool of mcpTools) {
    const gated = toolNeedsApproval(mcpTool);

    tools[mcpTool.name] = tool({
      description: mcpTool.description,
      inputSchema: resolveInputSchema(mcpTool.inputSchema),
      needsApproval: gated && !preAuthorized.has(mcpTool.name),
      execute: (input: unknown) => runMcpTool(mcpTool, input),
    });
  }

  return tools;
}
