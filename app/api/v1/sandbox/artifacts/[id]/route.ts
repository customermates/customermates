import type { NextRequest } from "next/server";

import { getUserService } from "@/core/di";

import { getArtifact } from "@/features/code-exec/artifact-store";
import { safeServeHeaders } from "@/features/code-exec/serve-bytes";

/**
 * Serves a sandbox output artifact (chart/export) to the chat. Auth is the user's
 * session; the artifact is returned only if it belongs to the user's company.
 * The chat renders these as download/preview links (see agent-message-view).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserService()
    .getActiveUserOrThrow()
    .catch(() => null);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const artifact = getArtifact(id, user.companyId);
  if (!artifact) return Response.json({ error: "not found" }, { status: 404 });

  // Buffer is a valid BodyInit (Uint8Array subclass) — serve it directly, no copy.
  return new Response(artifact.bytes, { status: 200, headers: safeServeHeaders(artifact.mime, artifact.name) });
}
