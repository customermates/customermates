import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpTool } from "@/features/mcp-tools/mcp-tool";

import {
  MCP_OPERATOR_TOOLS,
  mcpAlwaysOnToolsForAppMode,
  mcpToolGroupsForAppMode,
} from "@/features/mcp-tools/tool-registry";
import { MCP_ENDPOINT_PATH } from "@/features/auth/mcp-resource";
import { env } from "@/env";

import { createMcpRoute } from "./mcp-route-utils";
import { registerTemplateMcpFeatures } from "@/features/mcp-tools/templates.mcp-resources";
import { registerWikiMcpResources } from "@/features/mcp-tools/wiki.mcp-resources";

function registerFeatures(server: McpServer, tools: McpTool[]) {
  registerWikiMcpResources(server);
  registerTemplateMcpFeatures(server, tools);
}

export const mcpRoute = createMcpRoute(
  mcpToolGroupsForAppMode(env.APP_MODE),
  mcpAlwaysOnToolsForAppMode(env.APP_MODE),
  MCP_ENDPOINT_PATH,
  registerFeatures,
  MCP_OPERATOR_TOOLS,
);
