import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getUpsertRoutineInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpsertRoutineInteractor().invoke({ id: data?.id ?? null, enabled: true });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
