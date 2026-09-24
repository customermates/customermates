import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getListSocialPostsInteractor, getGetSocialPostInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(mapRequestJsonError);
    const result =
      typeof body === "object" && body !== null && Object.hasOwn(body, "postId")
        ? await getGetSocialPostInteractor().invoke(body)
        : await getListSocialPostsInteractor().invoke(body);

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
