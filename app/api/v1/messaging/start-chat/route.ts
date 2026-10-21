import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getStartChatInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { toSentMessageReceipt } from "@/ee/messaging/outbound/sent-message.schema";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getStartChatInteractor().invoke(data);

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(toSentMessageReceipt(result.data), { status: result.data.message ? 201 : 202 });
  } catch (error) {
    return handleError(error);
  }
}
