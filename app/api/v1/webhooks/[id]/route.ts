import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getDeleteWebhookInteractor, getGetWebhookByIdInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetWebhookByIdInteractor().invoke({ id });

    if (!result.ok) return interactorFailureResponse(result.error);
    if (!result.data) return NextResponse.json(null, { status: 200 });

    const { secret, headers, ...webhook } = result.data;

    return NextResponse.json(
      { ...webhook, hasSecret: secret != null && secret !== "", headerNames: Object.keys(headers ?? {}) },
      { status: 200 },
    );
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
