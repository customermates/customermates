import { MCP_ALWAYS_ON_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";

import { createMcpRoute } from "./mcp-route-utils";

export function countMcpTools(tools: Pick<McpTool, "name">[]): number {
  const names = tools.map((tool) => tool.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicates.length > 0) throw new Error(`Duplicate MCP tool names: ${[...new Set(duplicates)].join(", ")}`);

  return names.length;
}

export const MCP_TOOL_COUNT = countMcpTools([...Object.values(TOOL_GROUPS).flat(), ...ALWAYS_ON]);

export const maxDuration = 60;

const handler = createMcpRoute(MCP_TOOL_GROUPS, MCP_ALWAYS_ON_TOOLS, "/api/v1/mcp");

export { handler as GET, handler as POST, handler as DELETE };
