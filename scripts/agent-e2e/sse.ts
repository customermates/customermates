export type SseFrame = { type: string; seq?: number } & Record<string, unknown>;

export type SseTiming = {
  firstOutputMs: number | null;
  firstTextMs: number | null;
  lastFrameMs: number | null;
};

const OUTPUT_FRAMES = new Set(["delta", "activity", "activity_result", "approval_request", "ui_command"]);

export function parseSseChunk(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buffer;
  let boundary = rest.indexOf("\n\n");
  while (boundary >= 0) {
    const raw = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    boundary = rest.indexOf("\n\n");
    const data = raw.split("\n").find((line) => line.startsWith("data: "));
    if (data) frames.push(JSON.parse(data.slice(6)) as SseFrame);
  }
  return { frames, rest };
}

export function recordFrameTiming(timing: SseTiming, frame: SseFrame, elapsedMs: number) {
  if (OUTPUT_FRAMES.has(frame.type)) timing.firstOutputMs ??= elapsedMs;
  if (frame.type === "delta" && typeof frame.text === "string" && frame.text.trim()) timing.firstTextMs ??= elapsedMs;
  timing.lastFrameMs = elapsedMs;
}

export async function readSseFrames(
  response: Response,
  startedAt: number,
  onFrame: (frame: SseFrame) => Promise<void>,
): Promise<{ frames: SseFrame[]; timing: SseTiming }> {
  if (!response.body) throw new Error("The agent response carried no body.");
  const frames: SseFrame[] = [];
  const timing: SseTiming = { firstOutputMs: null, firstTextMs: null, lastFrameMs: null };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const parsed = parseSseChunk(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const frame of parsed.frames) {
      recordFrameTiming(timing, frame, Date.now() - startedAt);
      frames.push(frame);
      await onFrame(frame);
    }
  }
  return { frames, timing };
}
