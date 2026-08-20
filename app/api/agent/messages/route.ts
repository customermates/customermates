import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { getSendAgentMessageInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { runAgentLane } from "@/ee/agent-chat/agent-runner";
import { sse } from "@/ee/agent-chat/agent-stream-utils";
import type { SendAgentMessageResult } from "@/ee/agent-chat/send-agent-message.interactor";
import { isAgentTurnTerminalError } from "@/ee/agent-chat/agent-turn-request";
import { AGENT_LIMIT_EXCEEDED_MESSAGE, isAgentLimitExceededError } from "@/ee/agent-chat/agent-errors";

export const runtime = "nodejs";
export const maxDuration = 300;

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

function completedReplayStream(data: Extract<SendAgentMessageResult, { disposition: "completedReplay" }>) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        sse(1, "message_replay", {
          messageId: data.assistantMessage.id,
          parts: data.assistantMessage.parts,
          createdAt: data.assistantMessage.createdAt.toISOString(),
        }),
      );
      controller.enqueue(
        sse(2, "turn_done", {
          isError: isAgentTurnTerminalError(data.terminalCode),
          terminalCode: data.terminalCode,
          assistantMessageId: data.assistantMessage.id,
          affectedResources: data.affectedResources,
          creditsUsed: 0,
          numTurns: 0,
          errorMessage: null,
          replayed: true,
        }),
      );
      controller.close();
    },
  });
}

export async function POST(request: NextRequest) {
  if (env.AGENT_CHAT_DISABLED) return new Response(null, { status: 404 });

  try {
    const data = await request.json();
    const result = await getSendAgentMessageInteractor().invoke(data);
    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    if (result.data.disposition !== "run" && result.data.disposition !== "completedReplay") {
      const headers = new Headers({
        "x-client-request-id": result.data.clientRequestId,
      });
      if (result.data.conversationId) headers.set("x-conversation-id", result.data.conversationId);
      if (result.data.userMessageId) headers.set("x-user-message-id", result.data.userMessageId);
      return NextResponse.json(
        {
          code: `agent_turn_${result.data.disposition}`,
          disposition: result.data.disposition,
          clientRequestId: result.data.clientRequestId,
          conversationId: result.data.conversationId,
          userMessageId: result.data.userMessageId,
          retryAllowed: result.data.retryAllowed,
        },
        { status: 409, headers },
      );
    }

    const stream =
      result.data.disposition === "run"
        ? runAgentLane({ ...result.data, appBaseUrl: env.BASE_URL }, request.signal)
        : completedReplayStream(result.data);
    return new Response(stream, {
      status: 200,
      headers: {
        ...SSE_HEADERS,
        "x-conversation-id": result.data.conversationId,
        "x-user-message-id": result.data.userMessageId,
        "x-client-request-id": result.data.clientRequestId,
      },
    });
  } catch (error) {
    if (isAgentLimitExceededError(error)) return NextResponse.json(AGENT_LIMIT_EXCEEDED_MESSAGE, { status: 429 });
    return handleError(error);
  }
}
