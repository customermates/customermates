import type { ClientBase } from "pg";
import { LEGACY_CRM_TABLES } from "./legacy-migration-database";

const TABLES = ["Company", "UserRole", "RolePermission", "User", "AuthUser", "Subscription", "RecordSchemaState", "RecordTypeDefinition", "RecordFieldDefinition", "RecordRelationshipDefinition", "RecordSchemaRevision", "CrmRecord", "RecordIdentity", "RecordIdentityKey", "RecordIdentityLink", "RecordValue", "RecordValueDependency", "RecordLink", "RecordAssignment", "RecordTypeGrant", "P13n", "DataView", "Widget", "Routine", "RecordEventSubscription"];

/** Browser upgrade fixtures are copied only after the real SQL migration; both endpoints are disposable loopback databases. */
export async function copyGenericWorkspace(source: ClientBase, destination: ClientBase, companyId: string) {
  for (const client of [source, destination]) {
    const present = await client.query("SELECT 1 FROM unnest($1::text[]) name WHERE to_regclass(format('%I',name)) IS NOT NULL", [LEGACY_CRM_TABLES]);
    if (present.rowCount) throw new Error("Browser upgrade verification requires physically contracted schemas");
  }
  await destination.query("BEGIN");
  try {
    for (const table of TABLES) {
      const columns = (await destination.query<{ column_name: string; data_type: string }>('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position', [table])).rows;
      if (!columns.length) throw new Error("Missing browser fixture table");
      const rows = (await source.query(`SELECT * FROM "${table}" WHERE "${table === "Company" ? "id" : "companyId"}"=$1`, [companyId])).rows;
      for (const row of rows) {
        const keys = columns.map((column) => column.column_name);
        const values = columns.map((column) => column.data_type === "jsonb" && row[column.column_name] !== null ? JSON.stringify(row[column.column_name]) : row[column.column_name]);
        await destination.query(`INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")})`, values);
      }
    }
    await destination.query("COMMIT");
  } catch (error) { await destination.query("ROLLBACK"); throw error; }
}
