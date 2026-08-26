import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getListSocialPostsInteractor, getGetSocialPostInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { SocialPostsRuntimeBodySchema } from "@/ee/messaging/posts/social-post-request.schema";

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json().catch(mapRequestJsonError);
    const parsed = SocialPostsRuntimeBodySchema.safeParse(requestBody);
    if (!parsed.success) return NextResponse.json(z.prettifyError(parsed.error), { status: 400 });

    const body = parsed.data;
    const result =
      "postId" in body
        ? await getGetSocialPostInteractor().invoke(body)
        : await getListSocialPostsInteractor().invoke(body);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
