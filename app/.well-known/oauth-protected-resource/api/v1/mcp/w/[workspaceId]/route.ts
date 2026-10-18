import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/core/auth/better-auth";
import { env } from "@/env";
import { isMcpWorkspaceId, mcpWorkspaceUrl } from "@/features/auth/mcp-resource";

const protectedResourceMetadata = oAuthProtectedResourceMetadata(auth);

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!isMcpWorkspaceId(workspaceId)) return new Response(null, { status: 404 });

  const metadata = await protectedResourceMetadata(request);
  const body: Record<string, unknown> = await metadata.json();

  return new Response(JSON.stringify({ ...body, resource: mcpWorkspaceUrl(env.BASE_URL, workspaceId) }), {
    status: metadata.status,
    headers: metadata.headers,
  });
}
