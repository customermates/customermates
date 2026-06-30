import type { NextRequest } from "next/server";

import { getUserService } from "@/core/di";

import { deleteUpload, getUpload } from "@/features/code-exec/upload-store";
import { safeServeHeaders } from "@/features/code-exec/serve-bytes";

/**
 * Serves a user-uploaded file back to the chat (image preview / download chip). Auth
 * is the user's session; the upload is returned only if it belongs to the user's
 * company. Mirrors the output-artifact route.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserService()
    .getActiveUserOrThrow()
    .catch(() => null);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = getUpload(id, user.companyId);
  if (!upload) return Response.json({ error: "not found" }, { status: 404 });

  // Buffer is a valid BodyInit (Uint8Array subclass) — serve it directly, no copy.
  return new Response(upload.bytes, { status: 200, headers: safeServeHeaders(upload.mime, upload.name) });
}

/**
 * Drops an upload the user removed before sending it (reclaims the company quota
 * immediately rather than waiting out the 24h TTL). Tenant-checked, idempotent.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserService()
    .getActiveUserOrThrow()
    .catch(() => null);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  deleteUpload(id, user.companyId);
  return new Response(null, { status: 204 });
}
