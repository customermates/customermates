import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getCreateAgentChatFileUploadInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (env.AGENT_CHAT_DISABLED) return new Response(null, { status: 404 });
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getCreateAgentChatFileUploadInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
