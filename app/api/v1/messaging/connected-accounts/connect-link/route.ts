import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getCreateAuthLinkInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { isRedirect } from "@/features/auth/auth-outcome";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getCreateAuthLinkInteractor().invoke(data);

    if (!isRedirect(result)) return interactorFailureResponse(result.error);

    return NextResponse.json({ url: result.redirect }, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
