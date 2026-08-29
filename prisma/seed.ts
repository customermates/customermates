import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { createSeedContext } from "./seeds/context";
import { runSyntheticSeed } from "./seeds/run";
import { databaseUrlFromEnvironment, shouldIncludeLocalOperatorAccess } from "@/scripts/local-database-safety";

async function main(): Promise<void> {
  const databaseUrl = databaseUrlFromEnvironment(process.env);
  const includeLocalOperatorAccess = shouldIncludeLocalOperatorAccess(process.env);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const context = createSeedContext(prisma, {
    seedUserEmail: SYNTHETIC_SEED_USER.email,
    sharedUserPassword: SYNTHETIC_SEED_USER.password,
  });

  try {
    console.log("Seeding deterministic synthetic fixtures...");
    await runSyntheticSeed(context, { includeLocalOperatorAccess });
    console.log("Synthetic fixture seed complete");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
