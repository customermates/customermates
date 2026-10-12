import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetWebhooksApiInteractor, getUpsertWebhookInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { listQueryParams } from "@/core/api/list-query-params";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { toPublicWebhook } from "@/features/webhook/public-webhook";

export async function GET(request: NextRequest) {
  try {
    const result = await getGetWebhooksApiInteractor().invoke(listQueryParams(request.nextUrl.searchParams));

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json({ ...result.data, items: result.data.items.map(toPublicWebhook) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpsertWebhookInteractor().invoke(data);

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(toPublicWebhook(result.data), { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
