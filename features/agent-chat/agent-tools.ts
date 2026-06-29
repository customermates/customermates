import type { ToolSet } from "ai";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/all-tools";

import { buildAgentToolsFrom, toolNeedsApproval } from "./tool-gating";

export { toolNeedsApproval } from "./tool-gating";

/** Names of every tool that is gated behind approval (before per-user pre-authorization). */
export const GATED_TOOL_NAMES: string[] = ALL_MCP_TOOLS.filter(toolNeedsApproval).map((tool) => tool.name);

/**
 * Build the AI SDK tool set for one request by reusing the existing MCP tool
 * definitions in-process (same Zod schemas + TOON encoding the external MCP
 * server exposes).
 */
export function buildAgentTools(options: { preAuthorizedToolNames: string[] }): ToolSet {
  return buildAgentToolsFrom(ALL_MCP_TOOLS, options);
}
