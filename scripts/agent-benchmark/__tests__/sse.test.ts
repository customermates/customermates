import { afterEach, describe, expect, it, vi } from "vitest";

import type { SseFrame } from "../sse";

import { benchmarkServerSourceError, readSseFrames } from "../sse";

function timedSseResponse(
  clock: { now: number },
  frames: readonly (readonly [number, SseFrame])[],
) {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const next = frames[index++];
          if (!next) {
            controller.close();
            return;
          }
          clock.now = next[0];
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(next[1])}\n\n`),
          );
        },
      },
      { highWaterMark: 0 },
    ),
  );
}

describe("benchmark server source", () => {
  it("accepts only the exact clean source commit", () => {
    expect(
      benchmarkServerSourceError("current-head", "current-head"),
    ).toBeNull();
    expect(
      benchmarkServerSourceError("current-head", "dirty:current-head"),
    ).toContain("received dirty:current-head");
    expect(benchmarkServerSourceError("current-head", "unknown")).toContain(
      "received unknown",
    );
    expect(benchmarkServerSourceError("current-head", null)).toContain(
      "received no source header",
    );
  });
});

describe("benchmark SSE reader", () => {
  it("detaches exactly after the requested frame without consuming later frames", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"activity","seq":1}\n\ndata: {"type":"delta","seq":2,"text":"hello"}\n\ndata: {"type":"turn_done","seq":3}\n\n',
            ),
          );
          controller.close();
        },
      }),
    );

    const result = await readSseFrames(response, Date.now(), undefined, {
      detachAfterFrames: 2,
    });

    expect(result.detached).toBe(true);
    expect(result.frames.map((frame) => frame.seq)).toEqual([1, 2]);
    expect(result.timing.firstFrameMs).not.toBeNull();
    expect(result.timing.firstDeltaMs).not.toBeNull();
  });
});

describe("benchmark first-output timing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["activity", "approval_request", "ui_command"])(
    "times the first output at the first %s frame, ahead of progress and the first delta",
    async (type) => {
      const clock = { now: 1_000 };
      vi.spyOn(Date, "now").mockImplementation(() => clock.now);

      const result = await readSseFrames(
        timedSseResponse(clock, [
          [1_100, { type: "progress", seq: 1 }],
          [1_200, { type, seq: 2 }],
          [1_300, { type: "delta", seq: 3, text: "hello" }],
          [1_400, { type: "turn_done", seq: 4 }],
        ]),
        1_000,
      );

      expect(result.timing).toEqual({
        firstFrameMs: 100,
        firstOutputMs: 200,
        firstDeltaMs: 300,
        lastFrameMs: 400,
      });
    },
  );

  it("times the first output at the first delta when nothing else was shown", async () => {
    const clock = { now: 1_000 };
    vi.spyOn(Date, "now").mockImplementation(() => clock.now);

    const result = await readSseFrames(
      timedSseResponse(clock, [
        [1_100, { type: "stream_step_start", seq: 1 }],
        [1_250, { type: "delta", seq: 2, text: "hello" }],
        [1_400, { type: "turn_done", seq: 3 }],
      ]),
      1_000,
    );

    expect(result.timing.firstOutputMs).toBe(250);
    expect(result.timing.firstDeltaMs).toBe(250);
  });

  it("leaves the first output unset when the stream showed nothing", async () => {
    const clock = { now: 1_000 };
    vi.spyOn(Date, "now").mockImplementation(() => clock.now);

    const result = await readSseFrames(
      timedSseResponse(clock, [
        [1_100, { type: "progress", seq: 1 }],
        [1_200, { type: "turn_done", seq: 2 }],
      ]),
      1_000,
    );

    expect(result.timing).toEqual({
      firstFrameMs: 100,
      firstOutputMs: null,
      firstDeltaMs: null,
      lastFrameMs: 200,
    });
  });
});
