import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { getAgentChatRepo, getUserService } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { agentTurnSseStream } from "@/ee/agent-chat/agent-turn-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  if (env.AGENT_CHAT_DISABLED) return new Response(null, { status: 404 });

  try {
    const { conversationId } = await context.params;
    const user = await getUserService().getActiveUserOrThrow();
    const externalRunId = await getAgentChatRepo().findAgentTurnExternalRunUnscoped({
      conversationId,
      companyId: user.companyId,
      userId: user.id,
    });
    if (!externalRunId) return NextResponse.json({ code: "agent_run_not_found" }, { status: 404 });

    const startIndex = Number(request.nextUrl.searchParams.get("startIndex") ?? "0");
    return new Response(agentTurnSseStream(externalRunId, Number.isFinite(startIndex) ? startIndex : 0), {
      status: 200,
      headers: { ...SSE_HEADERS, "x-external-run-id": externalRunId },
    });
  } catch (error) {
    return handleError(error);
  }
}
