import { MCP_ALWAYS_ON_TOOLS, mcpToolGroupsForAppMode } from "@/features/mcp-tools/tool-registry";
import { MCP_ENDPOINT_PATH } from "@/features/auth/mcp-resource";
import { env } from "@/env";

import { createMcpRoute } from "./mcp-route-utils";
import { registerWikiMcpResources } from "@/features/mcp-tools/wiki.mcp-resources";

export const mcpRoute = createMcpRoute(
  mcpToolGroupsForAppMode(env.APP_MODE),
  MCP_ALWAYS_ON_TOOLS,
  MCP_ENDPOINT_PATH,
  registerWikiMcpResources,
);
