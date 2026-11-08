/**
 * One-time consolidation of LinkedIn identities stored twice for one profile (provider member id
 * and public username), per workspace. Dry run by default; --apply writes a private backup of
 * every affected identity first, applies in one transaction and reads every change back.
 *
 *   DATABASE_URL=... yarn identities:consolidate-linkedin --company <workspace id> [--exclude-record <id> ...]
 *   DATABASE_URL=... yarn identities:consolidate-linkedin --company <workspace id> --apply --backup-dir <dir>
 *
 * Re-running after an apply plans nothing, so the script is safe to repeat.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    company: { type: "string" },
    apply: { type: "boolean", default: false },
    "backup-dir": { type: "string" },
    "exclude-record": { type: "string", multiple: true, default: [] },
    verbose: { type: "boolean", default: false },
  },
});

const companyId = values.company;
if (!companyId) throw new Error("Pass --company with the workspace id");
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL to the workspace's database");
if (values.apply && !values["backup-dir"])
  throw new Error("--apply requires --backup-dir for the backup");

process.env.APP_MODE ??= "cloud";
const { getConsolidateLinkedinIdentitiesInteractor } = await import(
  "@/core/di"
);
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { prisma } = await import("@/prisma/db");

try {
  const result = await runWithoutTenant(() =>
    getConsolidateLinkedinIdentitiesInteractor().invoke(
      {
        companyId,
        apply: values.apply === true,
        excludeRecordIds: values["exclude-record"],
      },
      (snapshot) => {
        const directory = values["backup-dir"] as string;
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const file = join(
          directory,
          `linkedin-identities-${companyId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        );
        writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, {
          mode: 0o600,
        });
        chmodSync(file, 0o600);
        console.log(`backup: ${file} (${snapshot.rows.length} identities)`);
      },
    ),
  );
  const skipped = Object.groupBy(result.plan.skipped, (entry) => entry.reason);
  console.log(
    JSON.stringify(
      {
        companyId,
        mode: values.apply ? "apply" : "dry-run",
        busy: result.busy,
        applied: result.applied,
        linkedinIdentities: result.plan.identities,
        profilesToMerge: result.plan.merges.length,
        identitiesToRemove: result.plan.merges.reduce(
          (sum, merge) => sum + merge.mergedIds.length,
          0,
        ),
        identitiesToBackfill: result.plan.backfills.length,
        skipped: Object.fromEntries(
          Object.entries(skipped).map(([reason, list]) => [
            reason,
            list?.length ?? 0,
          ]),
        ),
        repair: result.repair,
        readback: result.readback,
      },
      null,
      2,
    ),
  );
  if (values.verbose)
    console.log(
      JSON.stringify(
        { merges: result.plan.merges, skipped: result.plan.skipped },
        null,
        2,
      ),
    );
  if (result.busy) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
