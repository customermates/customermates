import { retryMigrationTransaction } from "../retry-transaction";
import type { ClientBase } from "pg";

import { readLegacyModel } from "./legacy-model";
import { preflightLegacyRecords } from "./preflight";
import { backfillLegacyRecords } from "./backfill";
import { materializeMigratedCalculations } from "./materialize";
import { reconcileMigratedRecords } from "./reconcile";
import { backfillLegacyIdentities } from "./identity";

async function migrateLegacyWorkspaceOnce(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    const source = await readLegacyModel(client, companyId);
    const preflight = await preflightLegacyRecords(client, source);
    if (mode === "preflight" || preflight.issues.length) {
      await client.query("ROLLBACK");
      return {
        ok: preflight.issues.length === 0,
        preflight,
        reconciliation: null,
        calculated: 0,
        resumed: false,
      };
    }
    const state = (
      await client.query(
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1',
        [companyId],
      )
    ).rows[0];
    if (state && (state.storageMode !== "backfilled" || state.revision !== 1 || state.activeOperationId))
      throw new Error("Migration cannot overwrite an active or configured record model");
    if (!state && mode === "reconcile") throw new Error("Workspace has not been backfilled");
    let calculated = 0;
    if (!state) {
      const actor = (
        await client.query(
          'SELECT member.id FROM "User" member JOIN "UserRole" role ON role."companyId" = $1 AND role.id = member."roleId" WHERE member."companyId" = $1 AND role."isSystemRole" AND member.status = \'active\' ORDER BY member.id LIMIT 1',
          [companyId],
        )
      ).rows[0];
      await backfillLegacyRecords(client, source, actor?.id ?? "system:record-migration:v2");
      calculated = await materializeMigratedCalculations(client, source);
    }
    if (mode === "backfill") await backfillLegacyIdentities(client, companyId);
    const reconciliation = await reconcileMigratedRecords(client, source);
    if (!reconciliation.valid) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        preflight,
        reconciliation,
        calculated,
        resumed: Boolean(state),
      };
    }
    await client.query("COMMIT");
    return {
      ok: true,
      preflight,
      reconciliation,
      calculated,
      resumed: Boolean(state),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function migrateLegacyWorkspace(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  return retryMigrationTransaction(() => migrateLegacyWorkspaceOnce(client, companyId, mode));
}
