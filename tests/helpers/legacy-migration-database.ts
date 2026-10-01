import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, type ClientBase } from "pg";
import { getLocalDatabaseTestUrl } from "./database-test";
import { CRM_CONTRACTION_MIGRATION } from "@/prisma/record-migrations/expand";

export { CRM_CONTRACTION_MIGRATION };

/** Upgrade fixtures use the real pre-contract SQL schema, independently of the current Prisma client. */
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
    const migrations = (await readdir(resolve("prisma/migrations")))
      .filter((entry) => /^\d+_/.test(entry) && entry < CRM_CONTRACTION_MIGRATION)
      .sort();
    if (applyMigrations)
      for (const migration of migrations)
        await client.query(await readFile(resolve("prisma/migrations", migration, "migration.sql"), "utf8"));
    return { client, url: url.toString(), close };
  } catch (error) {
    await close();
    throw error;
  }
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
