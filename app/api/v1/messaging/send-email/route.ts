import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getSendEmailInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { toSentMessage, toSentMessageReceipt } from "@/ee/messaging/outbound/sent-message.schema";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getSendEmailInteractor().invoke(data);

    if (!result.ok) return interactorFailureResponse(result.error);

    const { message, repeated } = result.data;
    return message
      ? NextResponse.json(toSentMessage(message, repeated), { status: 200 })
      : NextResponse.json(toSentMessageReceipt(result.data), { status: 202 });
  } catch (error) {
    return handleError(error);
  }
}
