#!/usr/bin/env node
/**
 * Migration matrix, all on throwaway databases in this worktree's own PostgreSQL containers:
 *   fresh-pg17 / fresh-pg16  every migration on an empty database, seed twice, `migrate status` up to date and an empty
 *                            `migrate diff` against prisma/schema.prisma (PostgreSQL 16 reports its diff for information)
 *   upgrade-from-<ref>       a database migrated and seeded by <ref>'s own code (default origin/main, checked out in a
 *                            temporary git worktree), then upgraded by this branch: only the new migrations apply, in
 *                            order, the seed converges twice and the schema matches
 *
 *   node scripts/verify/migrations.mjs [--from origin/main] [--skip-pg16] [--skip-upgrade]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, relative, resolve } from "node:path";

import { databaseEnvironment, prepareDatabase } from "./lib/database.mjs";
import { ensureCluster, recreateDatabase, serverVersion } from "./lib/postgres.mjs";
import { capture, formatDuration, parseArguments, REPO_ROOT, run, seconds, table } from "./lib/process.mjs";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(0);
}

const options = parseArguments(process.argv.slice(2), { from: "origin/main", skipPg16: false, skipUpgrade: false, runId: "" });
const startedAt = Date.now();
const runId = options.runId || `migrations-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
const directory = resolve(REPO_ROOT, ".runs/verify", runId);
mkdirSync(directory, { recursive: true });

const migrations = (root) => readdirSync(resolve(root, "prisma/migrations")).filter((entry) => /^\d+_/.test(entry)).sort();

async function prisma(cwd, url, args, log) {
  return run(resolve(cwd, "node_modules/.bin/prisma"), args, { cwd, env: databaseEnvironment(url, { APP_MODE: "self-hosted" }), log });
}

async function checkConverged(name, url, log, { strictDiff = true } = {}) {
  const status = await prisma(REPO_ROOT, url, ["migrate", "status"], log);
  const diff = await prisma(REPO_ROOT, url, ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], log);
  const notes = [];
  if (status.code !== 0) notes.push("migrate status not up to date");
  if (diff.code === 2) notes.push(strictDiff ? "schema drift (migrate diff not empty)" : "migrate diff not empty (informational on this version)");
  else if (diff.code !== 0) notes.push(`migrate diff exited ${diff.code}`);
  return { ok: status.code === 0 && (diff.code === 0 || (!strictDiff && diff.code === 2)), notes };
}

async function fresh(major) {
  const name = `fresh-pg${major}`;
  const log = resolve(directory, `${name}.log`);
  const started = Date.now();
  const cluster = await ensureCluster(major);
  const url = await recreateDatabase(cluster, `crm_verify_migrations_fresh`);
  const prepared = await prepareDatabase(url, { seedTimes: 2, log, workflow: false });
  if (!prepared.ok) return { check: name, result: "FAIL", detail: `${prepared.failedStep} failed`, time: formatDuration(seconds(started)), log };
  const converged = await checkConverged(name, url, log, { strictDiff: major === 17 });
  await recreateDatabase(cluster, "crm_verify_migrations_fresh").catch(() => undefined);
  return {
    check: name,
    result: converged.ok ? "pass" : "FAIL",
    detail: [`PostgreSQL ${(await serverVersion(cluster)).split(" ")[0]}`, `${migrations(REPO_ROOT).length} migrations`, "seed x2", ...converged.notes].join(", "),
    time: formatDuration(seconds(started)),
    log,
  };
}

async function upgrade() {
  const name = `upgrade-from-${options.from.replace(/^origin\//, "")}`;
  const log = resolve(directory, `${name}.log`);
  const started = Date.now();
  // Outside the worktree, so test runners and file scans of the worktree never pick up the snapshot's files.
  const snapshot = resolve(homedir(), ".cache/customermates-verify", `${basename(REPO_ROOT)}-migration-snapshot`);
  const sha = await capture("git", ["rev-parse", "--short", options.from]);
  if (existsSync(snapshot)) await run("git", ["worktree", "remove", "--force", snapshot], { log });
  await run("git", ["worktree", "prune"], { log });
  const added = await run("git", ["worktree", "add", "--detach", snapshot, options.from], { log });
  if (added.code !== 0) return { check: name, result: "ERROR", detail: `could not check out ${options.from}`, time: "-", log };
  try {
    const sameLock = readFileSync(resolve(snapshot, "yarn.lock"), "utf8") === readFileSync(resolve(REPO_ROOT, "yarn.lock"), "utf8");
    const cluster = await ensureCluster(17);
    const url = await recreateDatabase(cluster, "crm_verify_migrations_upgrade");
    const install = sameLock
      ? await run("cp", ["-al", resolve(REPO_ROOT, "node_modules"), resolve(snapshot, "node_modules")], { log })
      : await run("yarn", ["install", "--frozen-lockfile", "--prefer-offline"], { cwd: snapshot, env: databaseEnvironment(url), log });
    if (install.code !== 0) return { check: name, result: "ERROR", detail: "dependency install for the snapshot failed", time: "-", log };
    await run(resolve(snapshot, "node_modules/.bin/prisma"), ["generate"], { cwd: snapshot, env: databaseEnvironment(url), log });
    for (const [step, command, args] of [
      ["snapshot migrate", resolve(snapshot, "node_modules/.bin/prisma"), ["migrate", "deploy"]],
      ["snapshot seed", resolve(snapshot, "node_modules/.bin/tsx"), ["prisma/seed.ts"]],
    ]) {
      const result = await run(command, args, { cwd: snapshot, env: databaseEnvironment(url, { APP_MODE: "self-hosted" }), log });
      if (result.code !== 0) return { check: name, result: "FAIL", detail: `${step} (${sha}) failed`, time: formatDuration(seconds(started)), log };
    }
    const before = new Set(migrations(snapshot));
    const expected = migrations(REPO_ROOT).filter((entry) => !before.has(entry));
    const logStart = existsSync(log) ? readFileSync(log, "utf8").length : 0;
    const deploy = await prisma(REPO_ROOT, url, ["migrate", "deploy"], log);
    const applied = [...readFileSync(log, "utf8").slice(logStart).matchAll(/Applying migration `([^`]+)`/g)].map((match) => match[1]);
    const inOrder = JSON.stringify(applied) === JSON.stringify(expected);
    if (deploy.code !== 0)
      return { check: name, result: "FAIL", detail: `upgrade migrate deploy failed after ${applied.length}/${expected.length}`, time: formatDuration(seconds(started)), log };
    const seeds = [];
    for (let index = 0; index < 2; index++)
      seeds.push((await run(resolve(REPO_ROOT, "node_modules/.bin/tsx"), ["prisma/seed.ts"], { env: databaseEnvironment(url, { APP_MODE: "self-hosted" }), log })).code);
    const converged = await checkConverged(name, url, log);
    const ok = inOrder && seeds.every((code) => code === 0) && converged.ok;
    await recreateDatabase(cluster, "crm_verify_migrations_upgrade").catch(() => undefined);
    return {
      check: name,
      result: ok ? "pass" : "FAIL",
      detail: [
        `${sha} -> this branch`,
        `${applied.length} new migrations${inOrder ? " in order" : ` (expected ${expected.length}: ${expected.join(", ") || "none"})`}`,
        seeds.every((code) => code === 0) ? "seed x2" : "seed failed",
        ...converged.notes,
      ].join(", "),
      time: formatDuration(seconds(started)),
      log,
    };
  } finally {
    await run("git", ["worktree", "remove", "--force", snapshot], { log });
  }
}

const checks = await Promise.all([fresh(17), ...(options.skipPg16 ? [] : [fresh(16)]), ...(options.skipUpgrade ? [] : [upgrade()])]);
console.log(`\nMigration matrix (${formatDuration(seconds(startedAt))})`);
console.log(table(checks.map((check) => ({ ...check, log: relative(REPO_ROOT, check.log) })), ["check", "result", "detail", "time", "log"]));
process.exit(checks.every((check) => check.result === "pass") ? 0 : 1);
