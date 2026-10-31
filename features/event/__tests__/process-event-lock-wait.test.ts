import { beforeEach, describe, expect, it, vi } from "vitest";

const runInTransaction = vi.hoisted(() =>
  vi.fn(async (fn: unknown, _options?: unknown) => (fn as () => Promise<unknown>)()),
);
vi.mock("@/core/decorators/transaction-runner", () => ({ runInTransaction }));
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));

import { EVENT_ADMISSION_TIMEOUT_MS, ProcessEventInteractor } from "../process-event.interactor";

describe("ProcessEventInteractor company lock wait", () => {
  beforeEach(() => {
    runInTransaction.mockClear();
  });

  it("waits for the company lock as long as the admission transaction may run", async () => {
    const event = {
      id: "e",
      companyId: "c",
      attempts: 0,
      deliveredAt: null,
      lastFailureCode: null,
      nextAttemptAt: new Date(0),
    };
    const outbox = {
      findUnscoped: vi.fn(() => Promise.resolve(event)),
      markDeliveredUnscoped: vi.fn(() => Promise.resolve(true)),
    };
    const admission = { admit: vi.fn(() => Promise.resolve()) };
    const interactor = new ProcessEventInteractor(outbox as never, admission as never);

    await expect(
      interactor.invoke({
        companyId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
        eventId: "7a1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
      }),
    ).resolves.toEqual({ status: "delivered" });
    expect(runInTransaction).toHaveBeenCalledWith(expect.any(Function), {
      companyId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
      timeout: EVENT_ADMISSION_TIMEOUT_MS,
      companyLockWait: EVENT_ADMISSION_TIMEOUT_MS,
    });
  });
});
