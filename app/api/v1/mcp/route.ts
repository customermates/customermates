import { createMcpRoute } from "./mcp-route-utils";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/all-tools";

export const maxDuration = 60;

const handler = createMcpRoute(ALL_MCP_TOOLS, "/api/v1/mcp");

export { handler as GET, handler as POST };
