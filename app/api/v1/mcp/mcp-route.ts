import { MCP_ALWAYS_ON_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";
import { MCP_ENDPOINT_PATH } from "@/features/auth/mcp-resource";

import { createMcpRoute } from "./mcp-route-utils";
import { registerWikiMcpResources } from "@/features/mcp-tools/wiki.mcp-resources";

export const mcpRoute = createMcpRoute(
  MCP_TOOL_GROUPS,
  MCP_ALWAYS_ON_TOOLS,
  MCP_ENDPOINT_PATH,
  registerWikiMcpResources,
);
