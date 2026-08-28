import { describe, it, expect, vi, beforeEach } from "vitest";

const { hookNotFound, resumeHookMock, startMock, workflowFn } = vi.hoisted(() => ({
  hookNotFound: new Error("hook not found"),
  resumeHookMock: vi.fn(),
  startMock: vi.fn().mockResolvedValue({ runId: "run_test" }),
  workflowFn: vi.fn(),
}));

vi.mock("@/workflows/registry", () => ({
  WORKFLOW_REGISTRY: { "some-task": workflowFn },
}));

vi.mock("workflow/api", () => ({
  resumeHook: resumeHookMock,
  start: startMock,
}));
vi.mock("workflow/errors", () => ({
  HookNotFoundError: { is: (error: unknown) => error === hookNotFound },
}));

import { BackgroundTaskService } from "../background-task.service";
import { transactionStorage } from "@/core/decorators/transaction-context";

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

describe("BackgroundTaskService.resume", () => {
  let service: BackgroundTaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackgroundTaskService();
  });

  it("resumes the hook directly and reports accepted delivery", async () => {
    resumeHookMock.mockResolvedValue({ runId: "run_test" });

    await expect(service.resume("approval-token", { requestId: "request-1" })).resolves.toBe(true);

    expect(resumeHookMock).toHaveBeenCalledWith("approval-token", {
      requestId: "request-1",
    });
  });

  it("reports a missing or already-consumed hook without hiding other failures", async () => {
    resumeHookMock.mockRejectedValueOnce(hookNotFound);
    await expect(service.resume("missing-token", {})).resolves.toBe(false);

    resumeHookMock.mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(service.resume("approval-token", {})).rejects.toThrow("queue unavailable");
  });
});
