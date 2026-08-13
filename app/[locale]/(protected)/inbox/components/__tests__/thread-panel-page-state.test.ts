import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { describe, expect, it } from "vitest";

import { resolveThreadPanelPageState } from "../thread-panel";

const thread = { id: "thread-current" } as MessagingThread;

describe("resolveThreadPanelPageState", () => {
  it.each([
    ["locked", { locked: true, requestedThreadId: "thread-current", thread }, { status: "locked" }],
    ["empty", { locked: false, requestedThreadId: null, thread }, { status: "empty" }],
    [
      "loading without a hydrated thread",
      { locked: false, requestedThreadId: "thread-current", thread: null },
      { status: "loading" },
    ],
    [
      "loading while a prior thread is still hydrated",
      { locked: false, requestedThreadId: "thread-next", thread },
      { status: "loading" },
    ],
  ])("resolves %s", (_name, input, expected) => {
    expect(resolveThreadPanelPageState(input)).toEqual(expected);
  });

  it("returns the matching thread with the content state", () => {
    expect(
      resolveThreadPanelPageState({
        locked: false,
        requestedThreadId: thread.id,
        thread,
      }),
    ).toEqual({ status: "content", thread });
  });
});
