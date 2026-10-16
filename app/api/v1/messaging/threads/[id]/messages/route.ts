import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getSendChatMessageInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { sentMessageReceipt } from "@/ee/messaging/outbound/sent-message-result";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getSendChatMessageInteractor().invoke({ ...data, threadId: id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return result.data.message && !result.data.repeated
      ? NextResponse.json(result.data.message, { status: 201 })
      : NextResponse.json(sentMessageReceipt(result.data), { status: 202 });
  } catch (error) {
    return handleError(error);
  }
}
