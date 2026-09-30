import { describe, expect, it, vi } from "vitest";

import { createErrorQueue } from "../error-queue";
import type { ErrorReport } from "../error-report";

const report: ErrorReport = {
  kind: "application-error",
  id: "event-1",
  buildId: "build-1",
  timestamp: 1,
  source: "server",
  level: "error",
  name: "Error",
  message: "failed",
  frames: [],
};

describe("bounded error delivery", () => {
  it("holds flush until durable enqueue finishes and reports enqueue rejection", async () => {
    let finish!: () => void;
    const queue = createErrorQueue(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const sent = queue.send(report);
    expect(await queue.flush(1)).toBe(false);
    finish();
    await sent;
    expect(await queue.flush()).toBe(true);
    const failed = createErrorQueue(() => Promise.reject(new Error("unavailable")));
    await expect(failed.send(report)).rejects.toThrow("unavailable");
  });

  it("bounds pending count and aggregate keepalive bytes", async () => {
    const publish = vi.fn(() => new Promise<void>(() => undefined));
    const queue = createErrorQueue(publish);
    for (let index = 0; index < 30; index++) void queue.send(report);
    await expect(queue.send(report)).rejects.toThrow("buffer is full");
    const browser = createErrorQueue(publish, 100);
    await expect(browser.send(report)).rejects.toThrow("buffer is full");
  });
});
