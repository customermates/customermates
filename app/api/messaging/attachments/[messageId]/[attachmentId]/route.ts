import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { getGetMessageAttachmentInteractor } from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  getRetryAfterSeconds,
  getUnipileStatus,
  isUnipileRateLimit,
  isUnipileResourceNotFound,
  unipileErrorCode,
} from "@/ee/messaging/messaging.service";
import { UnipileRequestError } from "@/ee/messaging/unipile-request-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> },
) {
  const { messageId, attachmentId } = await params;
  try {
    const result = await getGetMessageAttachmentInteractor().invoke({ messageId, attachmentId });
    if (!result.ok) return interactorFailureResponse(result.error);
    const { data } = result;

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

    if (err instanceof UnipileRequestError) {
      switch (unipileErrorCode(err)) {
        case CustomErrorCode.unipileDisconnectedAccount:
          return NextResponse.json("Reconnect the channel to load this attachment", { status: 409 });
        case CustomErrorCode.unipileAccountRestricted:
          return NextResponse.json("The provider has restricted this channel", { status: 409 });
        case CustomErrorCode.unipileRequestTimeout:
          return NextResponse.json("The provider did not answer in time", { status: 504 });
        case CustomErrorCode.unipileProviderRejected:
          return NextResponse.json("The provider refused this attachment", { status: 422 });
      }
    }
    if (getUnipileStatus(err) !== null) return NextResponse.json("Attachment provider unavailable", { status: 502 });

    return handleError(err);
  }
}
