import { Client } from "pg";

export const SEED_LOCK_NAME = "customermates:synthetic-seed";

export const SEED_LOCK_WAIT_MS = 900_000;
export const SEED_LOCK_POLL_MS = 2_000;
export const SEED_LOCK_HEARTBEAT_MS = 20_000;

export type SeedLock = { release: () => Promise<void> };

export type SeedLockOptions = {
  waitMs?: number;
  pollMs?: number;
  heartbeatMs?: number;
  onWait?: (waitedMs: number) => void;
  onLost?: (error: Error) => void;
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializes seed runs on one database. Two seeds writing the same fixture namespaces delete each other's rows
 * (foreign key and unique violations) or wait on each other's transactions, so a seed holds a transaction-level
 * advisory lock on its own connection for its whole run. A transaction lock survives a transaction pooler, and a
 * process that dies drops its connection, which releases the lock. A seed that cannot get the lock within the wait
 * fails with a message instead of waiting on a run that never ends.
 */
export async function acquireSeedLock(connectionString: string, options: SeedLockOptions = {}): Promise<SeedLock> {
  const waitMs = options.waitMs ?? SEED_LOCK_WAIT_MS;
  const pollMs = options.pollMs ?? SEED_LOCK_POLL_MS;
  const heartbeatMs = options.heartbeatMs ?? SEED_LOCK_HEARTBEAT_MS;
  const client = new Client({ connectionString });
  let held = false;
  let closed = false;
  client.on("error", (error) => {
    if (held && !closed) options.onLost?.(error);
  });
  await client.connect();
  const started = Date.now();
  try {
    for (;;) {
      await client.query("BEGIN");
      const { rows } = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked",
        [SEED_LOCK_NAME],
      );
      if (rows[0]?.locked) break;
      await client.query("ROLLBACK");
      const waited = Date.now() - started;
      if (waited >= waitMs)
        throw new Error(`Another seed has held the seed lock for ${Math.round(waited / 1000)} s; this run gave up`);
      options.onWait?.(waited);
      await pause(Math.min(pollMs, waitMs - waited));
    }
  } catch (error) {
    closed = true;
    await client.end().catch(() => undefined);
    throw error;
  }
  held = true;
  const heartbeat = setInterval(() => {
    client.query("SELECT 1").catch((error: Error) => {
      if (!closed) options.onLost?.(error);
    });
  }, heartbeatMs);
  heartbeat.unref();
  return {
    release: async () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}
