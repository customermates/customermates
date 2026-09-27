import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetCalendarsApiInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(mapRequestJsonError);
    const result = await getGetCalendarsApiInteractor().invoke(body);

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
