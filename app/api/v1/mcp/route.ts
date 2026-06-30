import { createMcpRoute } from "./mcp-route-utils";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/all-tools";

export const maxDuration = 60;

// The external MCP endpoint authenticates with a long-lived API key and has NO
// human approval step, so code execution here would be unattended RCE inside the
// tenant. run_code is exposed ONLY to the in-app agent (which gates it on approval);
// check_run only polls the in-process run store those agent runs write to, so it has
// no meaning externally either.
const SANDBOX_ONLY_TOOLS = new Set(["run_code", "check_run"]);
const EXTERNAL_TOOLS = ALL_MCP_TOOLS.filter((tool) => !SANDBOX_ONLY_TOOLS.has(tool.name));

const handler = createMcpRoute(EXTERNAL_TOOLS, "/api/v1/mcp");

export { handler as GET, handler as POST };
