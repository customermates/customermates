import { TOOL_GROUPS, ALWAYS_ON } from "@/features/mcp-tools/all-tools";

import { createMcpRoute } from "./mcp-route-utils";

export const maxDuration = 60;

const handler = createMcpRoute(TOOL_GROUPS, ALWAYS_ON, "/api/v1/mcp");

export { handler as GET, handler as POST, handler as DELETE };
