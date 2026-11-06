import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";

const db = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
  };
  const transaction = vi.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  return { tx, transaction };
});

vi.mock("@/prisma/db", () => ({ prisma: { $transaction: db.transaction } }));

const { runInTransaction } = await import("../transaction-runner");
const { transactionStorage } = await import("../transaction-context");
const { readOnceInTransaction } = await import("../read-once-in-transaction");

describe("runInTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation((fn) => fn(db.tx));
  });

  it("runs after-commit callbacks only after a successful result", async () => {
    const afterCommit = vi.fn().mockResolvedValue(undefined);

    const result = await runInTransaction(() => {
      const store = transactionStorage.getStore();
      store?.afterCommit.push(afterCommit);
      return Promise.resolve({ ok: true as const, data: "done" });
    });

    expect(result).toEqual({ ok: true, data: "done" });
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
      store?.afterCommit.push(afterCommit);
      return Promise.resolve(failure);
    });

    expect(result).toBe(failure);
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

  it("takes the company advisory lock unless the caller opts out", async () => {
    const lockCalls = () =>
      db.tx.$executeRaw.mock.calls.filter(([sql]) =>
        String((sql as string[]).join("?")).includes("pg_advisory_xact_lock"),
      );

    await runInTransaction(() => Promise.resolve("locked"), { companyId: "company-1" });
    expect(lockCalls()).toHaveLength(1);

    db.tx.$executeRaw.mockClear();
    await runInTransaction(() => Promise.resolve("unlocked"), { companyId: "company-1", lockCompany: false });
    expect(lockCalls()).toHaveLength(0);
  });

  it("shares concurrent reads, including nested readers, only within one read-only transaction", async () => {
    const load = vi.fn(() => Promise.resolve({ revision: 1 }));
    const read = () => readOnceInTransaction("model:workspace-a", load);
    const values = await runInTransaction(() => Promise.all([read(), runInTransaction(read)]), { readOnly: true });
    expect(values[0]).toBe(values[1]);
    expect(load).toHaveBeenCalledOnce();
    await runInTransaction(read, { readOnly: true });
    await read();
    await read();
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("keeps workspace and actor reads separate, including simultaneous transactions", async () => {
    const load = vi.fn(() => Promise.resolve({}));
    const read = (key: string) => readOnceInTransaction(key, load);
    const scopes = await Promise.all(
      [1, 2].map(() =>
        runInTransaction(() => Promise.all([read("policy:a:alice"), read("policy:a:bob"), read("policy:b:alice")]), {
          readOnly: true,
        }),
      ),
    );
    expect(load).toHaveBeenCalledTimes(6);
    expect(new Set(scopes.flat()).size).toBe(6);
  });

  it("keeps reads fresh during writes, even when a nested reader requests read-only mode", async () => {
    let revision = 1;
    const read = () => readOnceInTransaction("model:a", () => Promise.resolve(revision));
    await runInTransaction(async () => {
      expect(await read()).toBe(1);
      revision = 2;
      expect(await runInTransaction(read, { readOnly: true })).toBe(2);
    });
  });

  it("evicts failed reads and discards all shared reads after rollback", async () => {
    const error = new Error("read failed");
    const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ revision: 2 });
    const read = () => readOnceInTransaction("model:a", load);
    await expect(
      runInTransaction(
        async () => {
          await expect(Promise.all([read(), read()])).rejects.toBe(error);
          expect(load).toHaveBeenCalledOnce();
          await read();
          expect(load).toHaveBeenCalledTimes(2);
          throw error;
        },
        { readOnly: true },
      ),
    ).rejects.toBe(error);
    await runInTransaction(read, { readOnly: true });
    expect(load).toHaveBeenCalledTimes(3);
  });
});
