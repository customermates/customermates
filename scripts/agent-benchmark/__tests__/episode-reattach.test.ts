import { afterEach, describe, expect, it, vi } from "vitest";

import type { BenchmarkDb, Fixture } from "../fixtures";
import type { SseFrame } from "../sse";

import { runTurn } from "../episode";

const { SOURCE_COMMIT } = vi.hoisted(() => ({
  SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567",
}));

vi.mock("../build-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../build-source")>()),
  resolveBenchmarkRuntimeSource: () => ({
    sourceCommit: SOURCE_COMMIT,
    sourceDirty: false,
  }),
}));

function timedSseResponse(
  clock: { now: number },
  frames: readonly (readonly [number, SseFrame])[],
  headers?: Record<string, string>,
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
    { headers },
  );
}

async function runDetachedTurn(
  firstFrames: readonly (readonly [number, SseFrame])[],
  resumedFrames: readonly (readonly [number, SseFrame])[],
) {
  const clock = { now: 1_000 };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      timedSseResponse(clock, firstFrames, {
        "x-agent-benchmark-source-commit": SOURCE_COMMIT,
        "x-conversation-id": "conversation-1",
      }),
    )
    .mockResolvedValueOnce(timedSseResponse(clock, resumedFrames));
  vi.stubGlobal("fetch", fetchMock);

  const record = await runTurn({
    db: {} as BenchmarkDb,
    appUrl: "http://127.0.0.1:4000",
    cookie: "session=benchmark",
    fixture: { companyId: "company-1", actorUserId: "user-1" } as Fixture,
    modelId: "model-1",
    prompt: "Show me the open deals.",
    index: 0,
    conversationId: null,
    contexts: [],
    locale: "en",
    pageRoute: "/en/deals",
    driver: { detachAfterFrames: firstFrames.length },
    approvalDecision: "ignore",
  });

  return { record, fetchMock };
}

describe("benchmark turn reattach timing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the first output seen before the detach", async () => {
    const { record, fetchMock } = await runDetachedTurn(
      [
        [1_100, { type: "progress", seq: 1 }],
        [1_200, { type: "activity", seq: 2 }],
      ],
      [
        [1_300, { type: "delta", seq: 3, text: "Two open deals." }],
        [1_400, { type: "turn_done", seq: 4 }],
      ],
    );

    expect(record.error).toBeNull();
    expect(record).toMatchObject({ detached: true, reattached: true });
    expect(String(fetchMock.mock.calls[1][0])).toContain("startIndex=3");
    expect(record.timing).toEqual({
      firstFrameMs: 100,
      firstOutputMs: 200,
      firstDeltaMs: 300,
      lastFrameMs: 400,
    });
  });

  it("takes the first output from the reattached stream when the detach came before any", async () => {
    const { record } = await runDetachedTurn(
      [[1_100, { type: "progress", seq: 1 }]],
      [
        [1_200, { type: "approval_request", seq: 2, requestId: "approval-1" }],
        [1_300, { type: "delta", seq: 3, text: "Declined." }],
        [1_400, { type: "turn_done", seq: 4 }],
      ],
    );

    expect(record.error).toBeNull();
    expect(record).toMatchObject({ detached: true, reattached: true });
    expect(record.timing).toEqual({
      firstFrameMs: 100,
      firstOutputMs: 200,
      firstDeltaMs: 300,
      lastFrameMs: 400,
    });
  });
});
