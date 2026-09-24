import { describe, expect, it } from "vitest";

import { benchmarkServerSourceError, readSseFrames } from "../sse";

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
