import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";

import { createLiveDocsRetrievalAdmission } from "../live-docs-retrieval-admission";

describe("live documentation retrieval admission", () => {
  it("starts queued retrieval clocks only after earlier work completes", async () => {
    const admission = createLiveDocsRetrievalAdmission();
    const started: number[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = admission.run(async () => {
      started.push(1);
      await barrier;
      return "first";
    });
    const second = admission.run(() => {
      started.push(2);
      return Promise.resolve("second");
    });
    await Promise.resolve();
    expect(started).toEqual([1]);
    release();
    expect(await Promise.all([first, second])).toEqual(["first", "second"]);
    expect(started).toEqual([1, 2]);
  });

  it("does not swallow a failure or block the next invocation", async () => {
    const admission = createLiveDocsRetrievalAdmission();
    const failure = new Error("fixture failure");
    const first = admission.run(() => Promise.reject(failure));
    const second = admission.run(() => Promise.resolve("next"));
    await expect(first).rejects.toBe(failure);
    await expect(second).resolves.toBe("next");
    await expect(admission.drain()).resolves.toBeUndefined();
  });

  it("retains each caller's async context while serializing invocations", async () => {
    const admission = createLiveDocsRetrievalAdmission();
    const context = new AsyncLocalStorage<number>();
    const first = context.run(1, () => admission.run(() => Promise.resolve(context.getStore())));
    const second = context.run(2, () => admission.run(() => Promise.resolve(context.getStore())));
    expect(await Promise.all([first, second])).toEqual([1, 2]);
  });

  it("waits for all admitted work to settle before final cost reporting", async () => {
    const admission = createLiveDocsRetrievalAdmission();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finished: number[] = [];
    void admission.run(async () => {
      await barrier;
      finished.push(1);
    });
    void admission.run(() => {
      finished.push(2);
      return Promise.resolve();
    });
    const drained = admission.drain();
    await Promise.resolve();
    expect(finished).toEqual([]);
    release();
    await drained;
    expect(finished).toEqual([1, 2]);
  });
});
