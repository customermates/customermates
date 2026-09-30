import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

import { assertLocalDatabaseEnvironment } from "./local-database-safety";
import { migrateRecordWorkspace } from "../prisma/record-migrations/run";
import {
  finalizeReconciledRecordWorkspace,
  readFinalizedRecordWorkspace,
  withRecordWorkspaceSessionLock,
} from "../prisma/record-migrations/v7/finalize";

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "preflight" },
    database: { type: "string" },
    company: { type: "string" },
    output: { type: "string", default: ".runs/record-migration/report.json" },
  },
});
const connectionString = assertLocalDatabaseEnvironment(process.env);
const actualDatabase = decodeURIComponent(new URL(connectionString).pathname.slice(1));
if (!values.database || values.database !== actualDatabase)
  throw new Error("Pass --database with the exact disposable database name");
if (!["preflight", "backfill", "reconcile", "finalize"].includes(values.mode ?? "preflight"))
  throw new Error("Unsupported migration mode");
const mode = values.mode as "preflight" | "backfill" | "reconcile" | "finalize";
const client = new Client({ connectionString });
try {
  await client.connect();
  const companies = await client.query('SELECT id FROM "Company" WHERE ($1::text IS NULL OR id = $1) ORDER BY id', [
    values.company ?? null,
  ]);
  if (!companies.rowCount) throw new Error("No matching workspace found");
  const reports = [];
  for (const company of companies.rows) {
    if (mode !== "finalize") {
      reports.push(await migrateRecordWorkspace(client, company.id, mode, 6));
      continue;
    }
    reports.push(
      await withRecordWorkspaceSessionLock(client, company.id, async () => {
        const already = await readFinalizedRecordWorkspace(client, company.id);
        if (already) return finalizeReconciledRecordWorkspace(client, company.id);
        const reconciliation = await migrateRecordWorkspace(client, company.id, "reconcile", 6);
        if (!reconciliation.ok) return { ok: false, companyId: company.id, version: 7, reconciliation };
        return { ...(await finalizeReconciledRecordWorkspace(client, company.id)), reconciliation };
      }),
    );
  }
  const path = resolve(values.output ?? ".runs/record-migration/report.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ version: mode === "finalize" ? 7 : 6, database: actualDatabase, mode, reports }, null, 2), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      workspaces: reports.length,
      valid: reports.every((report) => report.ok),
      mode,
      report: path,
    }),
  );
  if (reports.some((report) => !report.ok)) process.exitCode = 1;
} finally {
  await client.end();
}
