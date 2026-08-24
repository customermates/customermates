import { getRun, start } from "workflow/api";

import type { SendAgentMessageResult } from "./send-agent-message.interactor";

import { getAgentChatRepo } from "@/core/di";
import { runAgentTurn } from "@/workflows/agent-turn";

import { AgentDurableStreamReader } from "./agent-durable-stream";
import { sse } from "./agent-stream-utils";

export type AdmittedAgentTurn = Extract<SendAgentMessageResult, { disposition: "run" }>;

export async function dispatchAgentTurn(admitted: AdmittedAgentTurn, appBaseUrl: string): Promise<string> {
  const run = await start(runAgentTurn, [
    {
      turnRequestId: admitted.turnRequestId,
      conversationId: admitted.conversationId,
      runId: admitted.runId,
      companyId: admitted.companyId,
      userId: admitted.userId,
      userName: admitted.userName,
      locale: admitted.locale,
      appBaseUrl,
      messages: admitted.messages,
      turnBudget: admitted.turnBudget,
      tenant: { userId: admitted.userId, companyId: admitted.companyId },
    },
  ]);

  await getAgentChatRepo().recordAgentTurnExternalRunUnscoped({
    turnRequestId: admitted.turnRequestId,
    companyId: admitted.companyId,
    externalRunId: run.runId,
  });

  return run.runId;
}

export function agentTurnSseStream(externalRunId: string, startIndex = 0): ReadableStream<Uint8Array> {
  const reader = getRun(externalRunId).getReadable({ startIndex }).getReader();
  const events = new AgentDurableStreamReader();
  let chunkIndex = startIndex - 1;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        chunkIndex += 1;
        const event = events.read(value);
        if (!event) continue;
        controller.enqueue(sse(chunkIndex, event.type, event.payload));
        return;
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}
