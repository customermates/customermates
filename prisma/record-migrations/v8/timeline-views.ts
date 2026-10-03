import type { ClientBase } from "pg";
import { z } from "zod";
import { presetId } from "../v2/contract/crm-preset";
import { migrateActivityQuery } from "../v4/activity-query";

const LEGACY_TYPES: Record<string, string> = {
  contactIds: "contact",
  organizationIds: "organization",
  dealIds: "deal",
  serviceIds: "service",
  taskIds: "task",
};
const Filter = z
  .object({
    field: z.string(),
    operator: z.enum(["in", "notIn", "hasSome", "hasNone"]),
    value: z.array(z.string()).optional(),
  })
  .strict();

export async function migrateTimelineViewReferences(client: ClientBase, companyId: string) {
  for (const table of ["DataView", "P13n"] as const) {
    const key = table === "DataView" ? "surfaceKey" : "p13nId";
    const rows = await client.query<{ id: string; filters: unknown }>(
      `SELECT id,filters FROM "${table}" WHERE "companyId"=$1 AND "${key}"='entity-timeline' FOR UPDATE`,
      [companyId],
    );
    for (const row of rows.rows) {
      if (row.filters === null) continue;
      const filters = z.array(Filter).max(20).parse(row.filters);
      const legacy = filters.filter((filter) => !filter.field.startsWith("records:"));
      migrateActivityQuery(companyId, legacy);
      for (const filter of filters.filter((filter) => filter.field.startsWith("records:"))) {
        z.uuid().parse(filter.field.slice(8));
        if ((filter.operator === "in" || filter.operator === "notIn") !== Boolean(filter.value?.length))
          throw new Error(`Invalid timeline record selection ${table}:${row.id}`);
        for (const id of filter.value ?? []) z.uuid().parse(id);
      }
      const converted = filters.map((filter) =>
        LEGACY_TYPES[filter.field]
          ? { ...filter, field: `records:${presetId(companyId, LEGACY_TYPES[filter.field])}` }
          : filter,
      );
      await client.query(`UPDATE "${table}" SET filters=$2::jsonb WHERE id=$1 AND "companyId"=$3`, [
        row.id,
        JSON.stringify(converted),
        companyId,
      ]);
    }
  }
}
