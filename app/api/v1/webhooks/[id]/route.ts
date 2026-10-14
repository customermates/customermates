import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getDeleteWebhookInteractor, getGetWebhookByIdInteractor, getUpsertWebhookInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { toPublicWebhook } from "@/features/webhook/public-webhook";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetWebhookByIdInteractor().invoke({ id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(toPublicWebhook(result.data), { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpsertWebhookInteractor().invoke({ ...data, id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(toPublicWebhook(result.data), { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDeleteWebhookInteractor().invoke({ id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
