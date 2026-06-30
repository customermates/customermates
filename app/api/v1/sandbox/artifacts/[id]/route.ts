import type { NextRequest } from "next/server";

import { getUserService } from "@/core/di";

import { getArtifact } from "@/features/code-exec/artifact-store";

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

  return new Response(new Uint8Array(artifact.bytes), {
    status: 200,
    headers: {
      "content-type": artifact.mime,
      "content-disposition": `inline; filename="${artifact.name.replace(/[^\w.\-]/g, "_")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
