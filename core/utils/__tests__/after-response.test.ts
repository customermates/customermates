import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));

vi.mock("next/server", () => ({ after: afterMock }));

import { runAfterResponse } from "../after-response";
import { transactionStorage } from "@/core/decorators/transaction-context";

describe("runAfterResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hands the task to after() without running it when no transaction is open", () => {
    const task = vi.fn().mockResolvedValue(undefined);

    runAfterResponse(task);

    expect(afterMock).toHaveBeenCalledExactlyOnceWith(task);
    expect(task).not.toHaveBeenCalled();
  });

  it("schedules the task only once the open transaction has committed", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const afterCommit: (() => Promise<void>)[] = [];

    transactionStorage.run({ client: {} as never, afterCommit, eventWakeups: new Set() }, () => runAfterResponse(task));

    expect(afterMock).not.toHaveBeenCalled();
    expect(afterCommit).toHaveLength(1);

    for (const commit of afterCommit) await commit();

    expect(afterMock).toHaveBeenCalledExactlyOnceWith(task);
    expect(task).not.toHaveBeenCalled();
  });

  it("turns a refused after() into a rejected commit hook instead of a synchronous throw", async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const afterCommit: (() => Promise<void>)[] = [];

    transactionStorage.run({ client: {} as never, afterCommit, eventWakeups: new Set() }, () =>
      runAfterResponse(() => Promise.resolve()),
    );

    const [commit] = afterCommit;
    let settled: Promise<void> | undefined;
    expect(() => {
      settled = commit();
    }).not.toThrow();
    await expect(settled).rejects.toThrow("outside a request scope");
  });
});
