import { getRun } from "workflow/api";

import { AgentDurableStreamReader } from "./agent-durable-stream";
import { sse } from "./agent-stream-utils";

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
