import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { handleError } from "@/core/api/interactor-handler";
import { getGetMessageAttachmentInteractor } from "@/core/di";
import {
  getRetryAfterSeconds,
  getUnipileStatus,
  isUnipileRateLimit,
  isUnipileResourceNotFound,
} from "@/ee/messaging/messaging.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> },
) {
  const { messageId, attachmentId } = await params;
  try {
    const { data } = await getGetMessageAttachmentInteractor().invoke({ messageId, attachmentId });

    const headers: Record<string, string> = {
      "content-type": data.contentType,
      "cache-control": "private, max-age=300",
    };
    if (data.fileName) headers["content-disposition"] = `inline; filename="${data.fileName.replace(/"/g, "")}"`;

    return new NextResponse(data.body, { status: 200, headers });
  } catch (err) {
    if (isUnipileRateLimit(err)) {
      const retryAfter = getRetryAfterSeconds(err);
      return new NextResponse(null, {
        status: 429,
        headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined,
      });
    }

    if (isUnipileResourceNotFound(err)) return NextResponse.json("Attachment not found", { status: 404 });

    if (getUnipileStatus(err) !== null) return NextResponse.json("Attachment provider unavailable", { status: 502 });

    return handleError(err);
  }
}
