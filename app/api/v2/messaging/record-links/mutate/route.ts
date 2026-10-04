import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMutateThreadRecordsInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/v2-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getMutateThreadRecordsInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
