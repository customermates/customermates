import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { handleError } from "@/core/api/interactor-handler";
import { getGetMessageAttachmentInteractor } from "@/core/di";

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
    return handleError(err);
  }
}
