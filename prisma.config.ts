import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = env("DATABASE_URL");
const directUrl = env("DATABASE_DIRECT_URL");

const datasourceConfig: { url: string; shadowDatabaseUrl?: string } = {
  url: directUrl,
};

if (directUrl && directUrl !== databaseUrl) datasourceConfig.shadowDatabaseUrl = databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: datasourceConfig,
});
