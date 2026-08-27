import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { getGetAgentRunStreamInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";
import { agentTurnSseStream } from "@/ee/agent-chat/agent-turn-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  if (env.AGENT_CHAT_DISABLED) return new Response(null, { status: 404 });

  try {
    const { conversationId } = await params;
    const result = await getGetAgentRunStreamInteractor().invoke({ conversationId });
    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    const requestedStartIndex = Number(request.nextUrl.searchParams.get("startIndex") ?? "0");
    const startIndex = Number.isFinite(requestedStartIndex) ? requestedStartIndex : 0;

    return new Response(agentTurnSseStream(result.data.externalRunId, startIndex), {
      status: 200,
      headers: { ...SSE_HEADERS, "x-external-run-id": result.data.externalRunId },
    });
  } catch (error) {
    return handleError(error);
  }
}
