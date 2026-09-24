import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getUpsertWebhookInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpsertWebhookInteractor().invoke(data);

    if (!result.ok) return interactorFailureResponse(result.error);

    const { secret, headers, ...webhook } = result.data;

    return NextResponse.json(
      { ...webhook, hasSecret: secret != null && secret !== "", headerNames: Object.keys(headers ?? {}) },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
