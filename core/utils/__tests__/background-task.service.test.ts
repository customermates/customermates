import { describe, it, expect, vi, beforeEach } from "vitest";

const { workflowFn } = vi.hoisted(() => ({ workflowFn: vi.fn() }));

vi.mock("@/workflows/registry", () => ({
  WORKFLOW_REGISTRY: { "some-task": workflowFn },
}));

vi.mock("workflow/api", () => ({
  start: vi.fn().mockResolvedValue({ runId: "run_test" }),
}));

import { start } from "workflow/api";

import { BackgroundTaskService } from "../background-task.service";
import { transactionStorage } from "@/core/decorators/transaction-context";

const startMock = vi.mocked(start);

describe("BackgroundTaskService.dispatch", () => {
  let service: BackgroundTaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackgroundTaskService();
  });

  it("starts the workflow immediately when no transaction is active", async () => {
    await service.dispatch("some-task" as never, { foo: "bar" } as never);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(workflowFn, [{ foo: "bar" }]);
  });

  it("defers start to afterCommit when inside a transaction", async () => {
    let afterCommitLen = -1;
    let startCallsDuringTransaction = -1;

    await transactionStorage.run(
      {
        client: {} as never,
        auditLogBatch: [],
        webhookDeliveryBatch: [],
        afterCommit: [],
        enabledWebhooks: null,
      },
      async () => {
        const result = await service.dispatch("some-task" as never, { foo: "bar" } as never);
        expect(result).toBeUndefined();

        const store = transactionStorage.getStore();
        if (!store) throw new Error("expected transaction store");
        afterCommitLen = store.afterCommit.length;
        startCallsDuringTransaction = startMock.mock.calls.length;
      },
    );

    expect(startCallsDuringTransaction).toBe(0);
    expect(afterCommitLen).toBe(1);
  });

  it("afterCommit hooks fire start when invoked", async () => {
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

    expect(startMock).not.toHaveBeenCalled();

    for (const fn of captured) await fn();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(workflowFn, [{ foo: "bar" }]);
  });
});
