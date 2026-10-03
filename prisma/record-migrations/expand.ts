import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertLocalDatabaseEnvironment } from "../../scripts/local-database-safety";

export const CRM_CONTRACTION_MIGRATION = "20261001000000_retire_legacy_crm_storage";

export async function expandRecordStorage(environment: NodeJS.ProcessEnv) {
  assertLocalDatabaseEnvironment(environment);
  const scratch = resolve(".runs/record-migration");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, "expansion-"));
  try {
    const migrations = resolve(directory, "migrations");
    await mkdir(migrations);
    const source = resolve("prisma/migrations");
    const entries = (await readdir(source))
      .filter((entry) => /^\d+_/.test(entry) && entry < CRM_CONTRACTION_MIGRATION)
      .sort();
    for (const entry of entries) await cp(resolve(source, entry), resolve(migrations, entry), { recursive: true });
    await cp(resolve(source, "migration_lock.toml"), resolve(migrations, "migration_lock.toml"));
    const config = resolve(directory, "prisma.config.ts");
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() } };\n`,
      { mode: 0o600 },
    );
    await new Promise<void>((complete, reject) => {
      const child = spawn(
        process.execPath,
        [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config],
        {
          env: environment,
          stdio: "inherit",
        },
      );
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) complete();
        else reject(new Error(`Record storage expansion failed (${signal ?? code ?? "unknown"})`));
      });
    });
    return { migrations: entries.length, contractionApplied: false };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
