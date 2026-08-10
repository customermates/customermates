import { MCP_ALWAYS_ON_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";

import { createMcpRoute } from "./mcp-route-utils";

export const MCP_TOOL_COUNT = new Set([...Object.values(TOOL_GROUPS).flat(), ...ALWAYS_ON].map((tool) => tool.name))
  .size;

export const maxDuration = 60;

const handler = createMcpRoute(MCP_TOOL_GROUPS, MCP_ALWAYS_ON_TOOLS, "/api/v1/mcp");

export { handler as GET, handler as POST, handler as DELETE };
