import type { NextRequest } from "next/server";

import { getUserService } from "@/core/di";

import {
  MAX_BYTES_PER_COMPANY,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_COMPANY,
  companyUsage,
  guessMime,
  putUpload,
} from "@/features/code-exec/upload-store";

// Buffer + multipart parsing need the Node runtime, not Edge.
export const runtime = "nodejs";

/**
 * Accepts a file the user attaches in the agent chat. Auth is the user's session;
 * the bytes are held tenant-scoped in the upload-store and returned by id through
 * the sibling GET route. The chat then references the upload as a `file` part whose
 * url is `/api/v1/sandbox/uploads/<id>` — bytes never travel inside the message.
 *
 * The model only ever sees the file's name/mime/size (and, for images/PDFs,
 * the bytes hydrated server-side at send time); arbitrary bytes are fed to the
 * sandbox, not echoed back to the model.
 */
export async function POST(request: NextRequest) {
  const user = await getUserService()
    .getActiveUserOrThrow()
    .catch(() => null);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Reject oversized bodies BEFORE buffering them into memory (Content-Length can be
  // absent/spoofed under chunked transfer, so the post-read byte check below is the
  // authoritative guard — this just avoids buffering an obviously-too-large body).
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 1_000_000) return Response.json({ error: "too_large" }, { status: 413 });

  const usage = companyUsage(user.companyId);
  if (usage.count >= MAX_UPLOADS_PER_COMPANY || usage.bytes >= MAX_BYTES_PER_COMPANY)
    return Response.json({ error: "upload_quota_exceeded" }, { status: 429 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no_file" }, { status: 400 });
  // Cheap pre-check before buffering; the authoritative check is on the byte length.
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return Response.json({ error: "empty" }, { status: 400 });
  if (bytes.length > MAX_UPLOAD_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  // Re-check the aggregate cap now that we know the real size (the body could push
  // the company over even if the pre-read count/bytes were under).
  if (usage.bytes + bytes.length > MAX_BYTES_PER_COMPANY)
    return Response.json({ error: "upload_quota_exceeded" }, { status: 429 });

  // Browser File.name is already a basename; strip any separators defensively.
  const name = (file.name || "file").split(/[\\/]/).pop() || "file";
  const mime = file.type || guessMime(name);

  const id = putUpload({ bytes, mime, name, companyId: user.companyId, userId: user.id });

  return Response.json(
    { id, name, mime, sizeBytes: bytes.length, url: `/api/v1/sandbox/uploads/${id}` },
    { status: 201 },
  );
}
