import { createMcpRoute } from "./mcp-route-utils";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/all-tools";

export const maxDuration = 60;

// The external MCP endpoint authenticates with a long-lived API key and has NO
// human approval step, so code execution here would be unattended RCE inside the
// tenant. run_code is exposed ONLY to the in-app agent (which gates it on approval).
const EXTERNAL_TOOLS = ALL_MCP_TOOLS.filter((tool) => tool.name !== "run_code");

const handler = createMcpRoute(EXTERNAL_TOOLS, "/api/v1/mcp");

export { handler as GET, handler as POST };
