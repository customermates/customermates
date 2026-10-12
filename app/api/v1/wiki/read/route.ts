import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetWikiPageInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getGetWikiPageInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    if (!result.data)
      return interactorFailureResponse((await failNotFound(CustomErrorCode.wikiPageNotFound, ["id"])).error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
