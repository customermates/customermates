import { isMcpWorkspaceId } from "@/features/auth/mcp-resource";

import { mcpRoute } from "../../mcp-route";

export const maxDuration = 60;

function unknownWorkspaceEndpoint() {
  return new Response(JSON.stringify({ error: "not_found", message: "No MCP endpoint exists at this address." }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function handler(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!isMcpWorkspaceId(workspaceId)) return unknownWorkspaceEndpoint();

  return mcpRoute(request, workspaceId);
}

export { handler as GET, handler as POST, handler as DELETE };
