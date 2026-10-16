import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getCompleteAgentChatFileUploadInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (env.AGENT_CHAT_DISABLED) return new Response(null, { status: 404 });
  try {
    const { fileId } = await params;
    const result = await getCompleteAgentChatFileUploadInteractor().invoke({ fileId });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
