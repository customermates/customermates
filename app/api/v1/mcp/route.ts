import { MCP_ALWAYS_ON_TOOLS, mcpToolGroupsForAppMode } from "@/features/mcp-tools/tool-registry";
import { env } from "@/env";

import { createMcpRoute } from "./mcp-route-utils";
import { registerWikiMcpResources } from "@/features/mcp-tools/wiki.mcp-resources";

export const maxDuration = 60;

const handler = createMcpRoute(
  mcpToolGroupsForAppMode(env.APP_MODE),
  MCP_ALWAYS_ON_TOOLS,
  "/api/v1/mcp",
  registerWikiMcpResources,
);

export { handler as GET, handler as POST, handler as DELETE };
