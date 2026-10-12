import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetWebhookDeliveriesApiInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { listQueryParams } from "@/core/api/list-query-params";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetWebhookDeliveriesApiInteractor().invoke({
      ...listQueryParams(request.nextUrl.searchParams),
      filters: [{ field: FilterFieldKey.webhookId, operator: FilterOperatorKey.in, value: [id] }],
    });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
