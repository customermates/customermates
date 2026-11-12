import type { NextRequest } from "next/server";
import type { ManageIncomingWebhookData } from "@/features/incoming-webhook/incoming-webhook.schema";

import { NextResponse } from "next/server";

import { getManageIncomingWebhookInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function handleIncomingWebhookRoute(request: NextRequest, action: ManageIncomingWebhookData["action"]) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getManageIncomingWebhookInteractor().invoke({ ...data, action });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
