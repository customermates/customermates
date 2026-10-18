import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { capture, REPO_ROOT } from "./process.mjs";

export const POSTGRES_IMAGES = {
  16: "pgvector/pgvector:0.8.1-pg16-bookworm",
  17: "pgvector/pgvector:0.8.1-pg17-bookworm",
};

/**
 * Durability is irrelevant for throwaway test databases; turning it off removes most commit I/O, which is what made
 * long interactive transactions in the database suite exceed their timeouts (P2028) on a loaded machine.
 */
const SERVER_SETTINGS = [
  "max_connections=1500",
  "shared_buffers=1GB",
  "fsync=off",
  "synchronous_commit=off",
  "full_page_writes=off",
  "max_wal_size=4GB",
  "checkpoint_timeout=30min",
];

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const STATE_DIRECTORY = resolve(REPO_ROOT, ".runs/verify");

function slug() {
  return (
    basename(REPO_ROOT)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "worktree"
  );
}

export function containerName(major) {
  return `crm-verify-${slug()}-pg${major}`;
}

function assertLoopbackAdminUrl(value) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !LOOPBACK.has(url.hostname) || url.search)
    throw new Error("VERIFY_POSTGRES_URL must be a loopback PostgreSQL URL without query parameters.");
  return url;
}

async function containerState(name) {
  try {
    return await capture("docker", ["inspect", "-f", "{{.State.Running}}", name]);
  } catch {
    return null;
  }
}

async function waitReady(name) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await capture("docker", ["exec", name, "pg_isready", "-U", "postgres", "-h", "127.0.0.1"]);
      await capture("docker", ["exec", name, "psql", "-U", "postgres", "-h", "127.0.0.1", "-Atc", "SELECT 1"]);
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  throw new Error(`PostgreSQL container ${name} did not become ready.`);
}

/**
 * A PostgreSQL cluster owned by this worktree: its own container (pgvector image of the requested major version) on an
 * ephemeral loopback port, with a random password kept in an ignored 0600 file. `VERIFY_POSTGRES_URL` points the
 * scripts at an existing loopback cluster instead (CI service containers).
 */
export async function ensureCluster(major = 17) {
  if (process.env.VERIFY_POSTGRES_URL && major === 17) {
    const url = assertLoopbackAdminUrl(process.env.VERIFY_POSTGRES_URL);
    return { major, adminUrl: url.toString(), container: null };
  }
  if (!POSTGRES_IMAGES[major]) throw new Error(`Unsupported PostgreSQL major version ${major}.`);
  mkdirSync(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
  const name = containerName(major);
  const secretFile = resolve(STATE_DIRECTORY, `postgres-${major}.secret`);
  const state = await containerState(name);
  if (state === null || !existsSync(secretFile)) {
    if (state !== null) await capture("docker", ["rm", "-f", "-v", name]);
    writeFileSync(secretFile, randomBytes(18).toString("hex"), { mode: 0o600 });
    await capture("docker", [
      "run",
      "-d",
      "--name",
      name,
      "--label",
      "com.customermates.verify=1",
      "--label",
      `com.customermates.verify-worktree=${REPO_ROOT}`,
      "--shm-size=1g",
      "-e",
      `POSTGRES_PASSWORD=${readFileSync(secretFile, "utf8").trim()}`,
      "-p",
      "127.0.0.1::5432",
      POSTGRES_IMAGES[major],
      ...SERVER_SETTINGS.flatMap((setting) => ["-c", setting]),
    ]);
  } else if (state !== "true") {
    await capture("docker", ["start", name]);
  }
  await waitReady(name);
  const port = (await capture("docker", ["port", name, "5432/tcp"])).split("\n")[0].split(":").pop();
  const password = readFileSync(secretFile, "utf8").trim();
  return { major, adminUrl: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`, container: name };
}

export function databaseUrl(cluster, database) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database)) throw new Error(`Invalid database name ${database}.`);
  const url = new URL(cluster.adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function psql(cluster, sql) {
  if (cluster.container)
    return capture("docker", ["exec", "-i", cluster.container, "psql", "-U", "postgres", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-Atq"], {
      input: sql,
    });
  const { Client } = await import("pg");
  const client = new Client({ connectionString: cluster.adminUrl });
  await client.connect();
  try {
    const result = await client.query(sql);
    return (Array.isArray(result) ? result.at(-1) : result).rows.map((row) => Object.values(row).join("|")).join("\n");
  } finally {
    await client.end();
  }
}

/** Drops and recreates `database`, optionally as a copy of `template` (a file-level copy: milliseconds, not a reseed). */
export async function recreateDatabase(cluster, database, template) {
  databaseUrl(cluster, database);
  if (template) databaseUrl(cluster, template);
  await psql(cluster, `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`);
  if (template) await psql(cluster, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${template}';`);
  await psql(cluster, `CREATE DATABASE "${database}"${template ? ` TEMPLATE "${template}"` : ""};`);
  return databaseUrl(cluster, database);
}

export async function dropDatabase(cluster, database) {
  databaseUrl(cluster, database);
  await psql(cluster, `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`);
}

export async function listDatabases(cluster, prefix) {
  const output = await psql(cluster, `SELECT datname FROM pg_database WHERE datname LIKE '${prefix.replace(/[^a-z0-9_]/g, "")}%' ORDER BY 1;`);
  return output.split("\n").filter(Boolean);
}

export async function serverVersion(cluster) {
  return psql(cluster, "SHOW server_version;");
}

export async function removeCluster(major) {
  const name = containerName(major);
  if ((await containerState(name)) !== null) await capture("docker", ["rm", "-f", "-v", name]);
}
