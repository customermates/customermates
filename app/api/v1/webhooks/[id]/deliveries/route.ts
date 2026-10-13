import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetWebhookDeliveriesByWebhookInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { listQueryParams } from "@/core/api/list-query-params";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetWebhookDeliveriesByWebhookInteractor().invoke({
      ...listQueryParams(request.nextUrl.searchParams),
      webhookId: id,
    });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
