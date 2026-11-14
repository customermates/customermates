import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { SEED_LOCK_NAME, acquireSeedLock } from "../seeds/seed-lock";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;
const url = database ?? "";

const FAST = { pollMs: 25, heartbeatMs: 1_000 };

suite("the seed lock", { timeout: 30_000 }, () => {
  it("lets one seed run at a time and hands the lock to the next waiting seed", async () => {
    const first = await acquireSeedLock(url, { ...FAST, waitMs: 2_000 });
    const waits: number[] = [];
    const second = acquireSeedLock(url, { ...FAST, waitMs: 5_000, onWait: (waited) => waits.push(waited) });
    let secondHeld = false;
    void second.then(() => {
      secondHeld = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondHeld).toBe(false);
    expect(waits.length).toBeGreaterThan(2);

    await first.release();
    const lock = await second;
    expect(secondHeld).toBe(true);
    await lock.release();
  });

  it("gives up with a message when the holder never lets go", async () => {
    const holder = await acquireSeedLock(url, { ...FAST, waitMs: 1_000 });
    try {
      await expect(acquireSeedLock(url, { ...FAST, waitMs: 200 })).rejects.toThrow(/Another seed has held/);
    } finally {
      await holder.release();
    }
  });

  it("drops the lock when the holder's connection dies", async () => {
    const holder = await acquireSeedLock(url, { ...FAST, waitMs: 1_000 });
    const admin = new Client({ connectionString: url });
    await admin.connect();
    try {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_locks
         WHERE locktype = 'advisory' AND granted AND pid <> pg_backend_pid()
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
           AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
        [SEED_LOCK_NAME],
      );
      const next = await acquireSeedLock(url, { ...FAST, waitMs: 5_000 });
      await next.release();
    } finally {
      await admin.end();
      await holder.release();
    }
  });

  it("names its lock after the seed", () => {
    expect(SEED_LOCK_NAME).toBe("customermates:synthetic-seed");
  });
});
