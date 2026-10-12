import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getResendWebhookDeliveryInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; deliveryId: string }> }) {
  try {
    const { id, deliveryId } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getResendWebhookDeliveryInteractor().invoke({ ...data, id: deliveryId, webhookId: id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json({ resentDeliveryId: deliveryId, deliveryId: result.data }, { status: 202 });
  } catch (error) {
    return handleError(error);
  }
}
