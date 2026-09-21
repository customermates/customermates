export type SseFrame = { type: string; seq?: number } & Record<string, unknown>;

export type SseTiming = { firstFrameMs: number | null; firstDeltaMs: number | null; lastFrameMs: number | null };

export async function readSseFrames(
  response: Response,
  startedAt: number,
  onFrame?: (frame: SseFrame) => Promise<void>,
): Promise<{ frames: SseFrame[]; timing: SseTiming }> {
  if (!response.body) throw new Error("The agent response carried no body.");
  const frames: SseFrame[] = [];
  const timing: SseTiming = { firstFrameMs: null, firstDeltaMs: null, lastFrameMs: null };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      const dataLine = rawFrame.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const frame = JSON.parse(dataLine.slice(6)) as SseFrame;
      const elapsed = Date.now() - startedAt;
      timing.firstFrameMs ??= elapsed;
      if (frame.type === "delta") timing.firstDeltaMs ??= elapsed;
      timing.lastFrameMs = elapsed;
      frames.push(frame);
      if (onFrame) await onFrame(frame);
    }
  }
  return { frames, timing };
}
