import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";

const db = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    auditLog: { createMany: vi.fn() },
    webhookDelivery: { createMany: vi.fn() },
  };
  const transaction = vi.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  return { tx, transaction };
});

vi.mock("@/prisma/db", () => ({ prisma: { $transaction: db.transaction } }));

const { runInTransaction } = await import("../transaction-runner");
const { transactionStorage } = await import("../transaction-context");

describe("runInTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation((fn) => fn(db.tx));
  });

  it("flushes queued writes and after-commit callbacks only after a successful result", async () => {
    const afterCommit = vi.fn().mockResolvedValue(undefined);

    const result = await runInTransaction(() => {
      const store = transactionStorage.getStore();
      store?.auditLogBatch.push({ id: "audit-1" } as never);
      store?.webhookDeliveryBatch.push({ id: "delivery-1" } as never);
      store?.afterCommit.push(afterCommit);
      return Promise.resolve({ ok: true as const, data: "done" });
    });

    expect(result).toEqual({ ok: true, data: "done" });
    expect(db.tx.auditLog.createMany).toHaveBeenCalledWith({
      data: [{ id: "audit-1" }],
    });
    expect(db.tx.webhookDelivery.createMany).toHaveBeenCalledWith({
      data: [{ id: "delivery-1" }],
    });
    expect(afterCommit).toHaveBeenCalledOnce();
  });

  it("rolls back a canonical returned failure without flushing queued side effects", async () => {
    const failure = {
      ok: false as const,
      error: createZodError("Expected business failure"),
    };
    const afterCommit = vi.fn();

    const result = await runInTransaction(() => {
      const store = transactionStorage.getStore();
      store?.auditLogBatch.push({ id: "audit-1" } as never);
      store?.webhookDeliveryBatch.push({ id: "delivery-1" } as never);
      store?.afterCommit.push(afterCommit);
      return Promise.resolve(failure);
    });

    expect(result).toBe(failure);
    expect(db.tx.auditLog.createMany).not.toHaveBeenCalled();
    expect(db.tx.webhookDelivery.createMany).not.toHaveBeenCalled();
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it("lets an outer transaction roll back a canonical failure returned by a nested transaction", async () => {
    const failure = {
      ok: false as const,
      error: createZodError("Nested business failure"),
    };

    const result = await runInTransaction(() => runInTransaction(() => Promise.resolve(failure)));

    expect(result).toBe(failure);
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("rethrows unexpected errors unchanged", async () => {
    const error = new Error("database unavailable");

    await expect(runInTransaction(() => Promise.reject(error))).rejects.toBe(error);
  });

  it("does not mistake another tool envelope for an interactor failure", async () => {
    const result = { ok: false as const, result: "Tool failure" };

    await expect(runInTransaction(() => Promise.resolve(result))).resolves.toBe(result);
  });
});
