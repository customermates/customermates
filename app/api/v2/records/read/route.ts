import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetRecordInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/v2-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getGetRecordInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
