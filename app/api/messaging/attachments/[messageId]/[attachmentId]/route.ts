import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { getGetMessageAttachmentInteractor } from "@/core/di";

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
  } catch (error) {
    return handleError(error);
  }
}
