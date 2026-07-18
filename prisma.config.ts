import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = process.env.DIRECT_URL?.trim() || env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: databaseUrl },
});
