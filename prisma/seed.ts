import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";
import { resolveBaseUrl } from "@/core/config/environment";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { createSeedContext } from "./seeds/context";
import { runSyntheticSeed } from "./seeds/run";

async function main(): Promise<void> {
  const databaseUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL must be configured");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const context = createSeedContext(prisma, {
    baseUrl: resolveBaseUrl(process.env),
    seedUserEmail: SYNTHETIC_SEED_USER.email,
    sharedUserPassword: SYNTHETIC_SEED_USER.password,
  });

  try {
    console.log("Seeding deterministic synthetic fixtures...");
    await runSyntheticSeed(context);
    console.log("Synthetic fixture seed complete");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
