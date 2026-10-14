import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetWebhookDeliveriesApiInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { listQueryParams } from "@/core/api/list-query-params";

export async function GET(request: NextRequest) {
  try {
    const result = await getGetWebhookDeliveriesApiInteractor().invoke(listQueryParams(request.nextUrl.searchParams));

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
