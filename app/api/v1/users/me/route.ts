import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetUserDetailsInteractor, getUpdateUserDetailsInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function GET() {
  try {
    const result = await getGetUserDetailsInteractor().invoke();

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpdateUserDetailsInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
