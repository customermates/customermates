import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { createSeedContext } from "./seeds/context";
import { runSyntheticSeed } from "./seeds/run";
import { databaseUrlFromEnvironment, shouldIncludeOperatorSeedAccess } from "@/scripts/local-database-safety";

async function main(): Promise<void> {
  const databaseUrl = databaseUrlFromEnvironment(process.env);
  const includeLocalOperatorAccess = shouldIncludeOperatorSeedAccess(process.env);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const context = createSeedContext(prisma, {
    seedUserEmail: SYNTHETIC_SEED_USER.email,
    sharedUserPassword: SYNTHETIC_SEED_USER.password,
  });

  try {
    console.log("Seeding deterministic synthetic fixtures...");
    const started = Date.now();
    const report = await runSyntheticSeed(context, { includeLocalOperatorAccess });
    if (report.reset.length) console.log(`Rebuilt workspaces on an older model: ${report.reset.join(", ")}`);
    if (report.slugsAssigned) console.log(`Gave ${report.slugsAssigned} demo workspaces their catalog slug`);
    for (const workspace of report.workspaces) {
      console.log(
        `  ${workspace.slug}: ${workspace.created} created, ${workspace.updated} updated, ${workspace.deleted} deleted, ${workspace.unchanged} unchanged (${workspace.durationMs} ms)`,
      );
    }
    console.log(`Synthetic fixture seed complete in ${Date.now() - started} ms`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
