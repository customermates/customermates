import "dotenv/config";

import { writeFileSync, mkdirSync } from "fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function dumpAllTables() {
  const tables = Object.keys(Prisma.ModelName);
  const seedsDir = "./prisma/seeds";

  mkdirSync(seedsDir, { recursive: true });

  console.log("Dumping data from all tables...");

  for (const table of tables) {
    try {
      const data = await (prisma as any)[table].findMany({
        take: 1000,
      });

      const fileName = `${seedsDir}/${table.toLowerCase()}.json`;

      writeFileSync(fileName, JSON.stringify(data, null, 2));

      console.log(`✅ Dumped ${data.length} records from ${table} to ${fileName}`);
    } catch (error) {
      console.log(`❌ Error dumping ${table}:`, error);
    }
  }
}

async function main() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    console.error("💡 Make sure your database is running and DATABASE_URL is set correctly.");
    process.exit(1);
  }

  try {
    await dumpAllTables();
    console.log("🎉 Seed creation completed!");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
