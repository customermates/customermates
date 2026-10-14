import { describe, expect, it } from "vitest";

import { serializeTransaction } from "../serialized-pg-adapter";

type Transaction = Parameters<typeof serializeTransaction>[0];

function fakeTransaction() {
  const log: string[] = [];
  let active = 0;
  let peak = 0;
  const work = async (label: string) => {
    active += 1;
    peak = Math.max(peak, active);
    log.push(`start ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    log.push(`end ${label}`);
    active -= 1;
  };
  const transaction = {
    provider: "postgres",
    adapterName: "fake",
    options: { usePhantomQuery: false },
    queryRaw: async (query: { sql: string }) => {
      await work(query.sql);
      if (query.sql === "fail") throw new Error("query failed");
      return { columnNames: [], columnTypes: [], rows: [] };
    },
    executeRaw: async (query: { sql: string }) => {
      await work(query.sql);
      return 0;
    },
    commit: () => work("commit"),
    rollback: () => work("rollback"),
  } as unknown as Transaction;
  return { transaction, log, peak: () => peak };
}

const query = (sql: string) => ({ sql, args: [], argTypes: [] });

describe("serialized PostgreSQL transaction", () => {
  it("runs overlapping queries of one transaction one at a time and releases only after them", async () => {
    const fake = fakeTransaction();
    const serialized = serializeTransaction(fake.transaction);
    await Promise.all([
      serialized.queryRaw(query("a")),
      serialized.queryRaw(query("b")),
      serialized.executeRaw(query("ROLLBACK")),
      serialized.rollback(),
    ]);
    expect(fake.peak()).toBe(1);
    expect(fake.log).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start ROLLBACK",
      "end ROLLBACK",
      "start rollback",
      "end rollback",
    ]);
    expect(serialized.options).toEqual({ usePhantomQuery: false });
  });

  it("keeps the queue moving after a failed query", async () => {
    const fake = fakeTransaction();
    const serialized = serializeTransaction(fake.transaction);
    const failed = serialized.queryRaw(query("fail"));
    const next = serialized.queryRaw(query("next"));
    await expect(failed).rejects.toThrow("query failed");
    await expect(next).resolves.toMatchObject({ rows: [] });
  });
});
