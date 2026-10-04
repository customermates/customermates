import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, type ClientBase } from "pg";
import { getLocalDatabaseTestUrl } from "./database-test";

/** The single migration that converts the legacy CRM tables into configurable records. */
export const CONFIGURABLE_RECORDS_MIGRATION = "20261004000000_configurable_records";

/** Legacy CRM tables removed by the configurable records migration. */
export const LEGACY_CRM_TABLES = [
  "Contact",
  "Organization",
  "Deal",
  "Service",
  "Task",
  "CustomColumn",
  "CustomFieldValue",
  "ContactIdentifier",
  "ServiceDeal",
  "ServiceUser",
  "DealOrganization",
  "DealUser",
  "DealContact",
  "ContactUser",
  "OrganizationUser",
  "TaskUser",
  "TaskContact",
  "TaskOrganization",
  "TaskDeal",
  "TaskService",
  "ContactOrganization",
  "EntityTerminology",
] as const;

export async function migrationNames(filter: (name: string) => boolean = () => true) {
  return (await readdir(resolve("prisma/migrations"))).filter((entry) => /^\d+_/.test(entry) && filter(entry)).sort();
}

export async function readMigration(name: string) {
  return readFile(resolve("prisma/migrations", name, "migration.sql"), "utf8");
}

/** Upgrade fixtures use the real legacy SQL schema (every migration before the conversion), independently of the Prisma client. */
export async function createLegacyMigrationDatabase(sourceUrl = getLocalDatabaseTestUrl(), applyMigrations = true) {
  if (!sourceUrl) throw new Error("Legacy migration verification requires a disposable loopback database");
  const source = new URL(sourceUrl);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(source.hostname))
    throw new Error("Migration fixture databases must use loopback");
  const name = `crm_upgrade_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(source);
  url.pathname = `/${name}`;
  url.search = "";
  const client = new Client({ connectionString: url.toString() });
  const close = async () => {
    await client.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  };
  try {
    await client.connect();
    await client.query("SET TIME ZONE 'UTC'");
    if (applyMigrations)
      for (const migration of await migrationNames((entry) => entry < CONFIGURABLE_RECORDS_MIGRATION))
        await client.query(await readMigration(migration));
    return { client, url: url.toString(), name, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Applies the configurable records migration (and any later migration) as plain SQL, without the Prisma ledger. */
export async function applyConfigurableRecordsMigration(client: ClientBase, { later = true } = {}) {
  for (const migration of await migrationNames((entry) =>
    later ? entry >= CONFIGURABLE_RECORDS_MIGRATION : entry === CONFIGURABLE_RECORDS_MIGRATION,
  ))
    await client.query(await readMigration(migration));
}

/**
 * Runs `prisma migrate deploy` against a disposable database with a temporary copy of the selected migrations,
 * so the Prisma ledger records exactly what a deployment of that repository state would.
 */
export async function deployMigrations(url: string, include: (name: string) => boolean = () => true) {
  const scratch = resolve(".runs/migration-tests");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, "deploy-"));
  try {
    const migrations = resolve(directory, "migrations");
    await mkdir(migrations);
    for (const entry of await migrationNames(include))
      await cp(resolve("prisma/migrations", entry), resolve(migrations, entry), { recursive: true });
    await cp(resolve("prisma/migrations/migration_lock.toml"), resolve(migrations, "migration_lock.toml"));
    const config = resolve(directory, "prisma.config.ts");
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: ${JSON.stringify(url)} } };\n`,
      { mode: 0o600 },
    );
    return await prismaCli(["migrate", "deploy", "--config", config], url);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Runs a Prisma CLI command against a disposable database and resolves with its exit code and output. */
export function prismaCli(args: string[], url: string, onSpawn?: (pid: number) => void) {
  return new Promise<{ code: number | null; output: string }>((complete, reject) => {
    const child = spawn(process.execPath, [resolve("node_modules/prisma/build/index.js"), ...args], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    if (child.pid) onSpawn?.(child.pid);
    child.once("error", reject);
    child.once("exit", (code) => complete({ code, output }));
  });
}

/** Parameterized fixture writes only: this is never imported by application interactors. */
export function legacyFixtureWriter(client: ClientBase) {
  const delegates: Record<string, ReturnType<typeof delegate>> = {};
  function delegate(table: string) {
    if (!/^[A-Z][A-Za-z0-9]+$/.test(table)) throw new Error("Invalid fixture table");
    const metadata = () =>
      client.query<{ column_name: string; data_type: string }>(
        "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1",
        [table],
      );
    const create = async <T extends Record<string, unknown>>({ data }: { data: T }) => {
      const columns = (await metadata()).rows;
      if (!columns.length) throw new Error("Fixture table is missing");
      const value: Record<string, unknown> = { id: randomUUID(), ...data };
      if (columns.some((column) => column.column_name === "updatedAt") && value.updatedAt === undefined)
        value.updatedAt = new Date();
      const keys = Object.keys(value).filter((key) => value[key] !== undefined);
      for (const key of keys)
        if (!columns.some((column) => column.column_name === key))
          throw new Error(`Unknown fixture column ${table}.${key}`);
      const params = keys.map((key) =>
        columns.find((column) => column.column_name === key)?.data_type === "jsonb" && value[key] !== null
          ? JSON.stringify(value[key])
          : value[key],
      );
      const result = await client.query(
        `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`,
        params,
      );
      return result.rows[0] as T & { id: string };
    };
    const update = async <T extends Record<string, unknown>>({ where, data }: { where: { id: string }; data: T }) => {
      const columns = (await metadata()).rows,
        keys = Object.keys(data).filter((key) => data[key] !== undefined);
      for (const key of keys)
        if (!columns.some((column) => column.column_name === key)) throw new Error("Unknown fixture update column");
      const params = keys.map((key) =>
        columns.find((column) => column.column_name === key)?.data_type === "jsonb" && data[key] !== null
          ? JSON.stringify(data[key])
          : data[key],
      );
      const result = await client.query(
        `UPDATE "${table}" SET ${keys.map((key, index) => `"${key}"=$${index + 2}`).join(",")} WHERE id=$1 RETURNING *`,
        [where.id, ...params],
      );
      return result.rows[0] as T & { id: string };
    };
    const createMany = async <T extends Record<string, unknown>>({ data }: { data: T[] }) => {
      for (const row of data) await create({ data: row });
      return { count: data.length };
    };
    return { create, createMany, update };
  }
  return new Proxy(delegates, {
    get(target, key: string) {
      return (target[key] ??= delegate(key[0].toUpperCase() + key.slice(1)));
    },
  });
}
