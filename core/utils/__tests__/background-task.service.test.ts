import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk/v3", () => ({
  tasks: { trigger: vi.fn().mockResolvedValue({ id: "run_test" }) },
}));

import { tasks } from "@trigger.dev/sdk/v3";

import { BackgroundTaskService } from "../background-task.service";
import { transactionStorage } from "@/core/decorators/transaction-context";

const triggerMock = vi.mocked(tasks.trigger);

describe("BackgroundTaskService.dispatch", () => {
  let service: BackgroundTaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackgroundTaskService();
  });

  it("fires tasks.trigger immediately when no transaction is active", async () => {
    const result = await service.dispatch("some-task" as never, { foo: "bar" } as never);

    expect(triggerMock).toHaveBeenCalledTimes(1);
    expect(triggerMock).toHaveBeenCalledWith("some-task", { foo: "bar" }, undefined);
    expect(result).toEqual({ runId: "run_test" });
  });

  it("defers tasks.trigger to afterCommit when inside a transaction", async () => {
    let afterCommitLen = -1;
    let triggerCallsDuringTransaction = -1;

    await transactionStorage.run(
      { client: {} as never, auditLogBatch: [], webhookDeliveryBatch: [], afterCommit: [], enabledWebhooks: null },
      async () => {
        const result = await service.dispatch("some-task" as never, { foo: "bar" } as never);
        expect(result).toBeUndefined();

        const store = transactionStorage.getStore();
        if (!store) throw new Error("expected transaction store");
        afterCommitLen = store.afterCommit.length;
        triggerCallsDuringTransaction = triggerMock.mock.calls.length;
      },
    );

    expect(triggerCallsDuringTransaction).toBe(0);
    expect(afterCommitLen).toBe(1);
  });

  it("afterCommit hooks fire tasks.trigger when invoked", async () => {
    const captured: (() => Promise<void>)[] = [];

    await transactionStorage.run(
      {
        client: {} as never,
        auditLogBatch: [],
        webhookDeliveryBatch: [],
        afterCommit: captured,
        enabledWebhooks: null,
      },
      async () => {
        await service.dispatch("some-task" as never, { foo: "bar" } as never);
      },
    );

    expect(triggerMock).not.toHaveBeenCalled();

    for (const fn of captured) await fn();

    expect(triggerMock).toHaveBeenCalledTimes(1);
    expect(triggerMock).toHaveBeenCalledWith("some-task", { foo: "bar" }, undefined);
  });
});
