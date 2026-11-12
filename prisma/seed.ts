import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { createSeedContext } from "./seeds/context";
import { runSyntheticSeed } from "./seeds/run";
import { acquireSeedLock } from "./seeds/seed-lock";
import { SOLUTION_SEED_BUDGET_MS } from "./seeds/solutions/seed-solutions";
import { databaseUrlFromEnvironment, shouldIncludeOperatorSeedAccess } from "@/scripts/local-database-safety";

const SEED_HARD_LIMIT_MS = SOLUTION_SEED_BUDGET_MS + 300_000;
const SHUTDOWN_GRACE_MS = 10_000;
const WAIT_NOTICE_MS = 30_000;

function graceElapsed(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

async function main(): Promise<void> {
  const databaseUrl = databaseUrlFromEnvironment(process.env);
  const includeLocalOperatorAccess = shouldIncludeOperatorSeedAccess(process.env);

  const stop = new AbortController();
  let nextNotice = 0;
  const lock = await acquireSeedLock(databaseUrl, {
    onWait: (waitedMs) => {
      if (waitedMs < nextNotice) return;
      nextNotice = waitedMs + WAIT_NOTICE_MS;
      console.log(`Another seed holds this database; waiting for it (${Math.round(waitedMs / 1000)} s so far)...`);
    },
    onLost: (error) => stop.abort(error),
  });
  const hardLimit = setTimeout(() => {
    console.error(`The seed ran past its ${SEED_HARD_LIMIT_MS} ms limit and was stopped.`);
    process.exit(1);
  }, SEED_HARD_LIMIT_MS);
  hardLimit.unref();

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const context = createSeedContext(prisma, {
    seedUserEmail: SYNTHETIC_SEED_USER.email,
    sharedUserPassword: SYNTHETIC_SEED_USER.password,
  });

  try {
    console.log("Seeding deterministic synthetic fixtures...");
    const started = Date.now();
    const report = await runSyntheticSeed(context, { includeLocalOperatorAccess, signal: stop.signal });
    if (report.reset.length) console.log(`Rebuilt workspaces on an older model: ${report.reset.join(", ")}`);
    if (report.slugsAssigned) console.log(`Gave ${report.slugsAssigned} demo workspaces their catalog slug`);
    for (const workspace of report.workspaces) {
      console.log(
        `  ${workspace.slug}: ${workspace.created} created, ${workspace.updated} updated, ${workspace.deleted} deleted, ${workspace.unchanged} unchanged (${workspace.durationMs} ms)`,
      );
    }
    console.log(`Synthetic fixture seed complete in ${Date.now() - started} ms`);
  } finally {
    clearTimeout(hardLimit);
    await Promise.race([prisma.$disconnect(), graceElapsed(SHUTDOWN_GRACE_MS)]);
    await lock.release();
  }
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), SHUTDOWN_GRACE_MS).unref();
  });
