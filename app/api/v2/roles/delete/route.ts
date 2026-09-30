import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDeleteRoleInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(mapRequestJsonError);
    const result = await getDeleteRoleInteractor().invoke(input);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
