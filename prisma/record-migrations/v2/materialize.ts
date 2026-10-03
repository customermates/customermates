import type { ClientBase } from "pg";
import type { LegacyModel } from "./legacy-model";
import type { CalculationContext } from "./contract/calculation";
import type { MigrationValue } from "./value-storage";

import { evaluateCalculation, valueResult } from "./contract/calculation";
import { scalarMatchesType, validateRecordModel } from "./contract/record-model-validation";
import { readMigrationValue, writeMigrationValues } from "./value-storage";

export async function materializeMigratedCalculations(client: ClientBase, source: LegacyModel): Promise<number> {
  const fields = new Map(source.model.fields.map((field) => [field.id, field]));
  let queued: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queued.then(operation);
    queued = result.catch(() => undefined);
    return result;
  };
  const context: CalculationContext = {
    field: async (ref, fieldId) => {
      const field = fields.get(fieldId);
      if (!field || field.typeId !== ref.typeId) throw new Error("Migration calculation references an invalid field");
      const result = await serial(() =>
        client.query(
          'SELECT * FROM "RecordValue" WHERE "companyId" = $1 AND "typeId" = $2 AND "recordId" = $3 AND "fieldId" = $4',
          [source.companyId, ref.typeId, ref.recordId, fieldId],
        ),
      );
      return readMigrationValue(result.rows[0], field);
    },
    related: async (ref, relationId, direction) => {
      const owner = direction === "outgoing" ? "source" : "target";
      const target = direction === "outgoing" ? "target" : "source";
      const result = await serial(() =>
        client.query(
          `SELECT "${target}TypeId" AS "typeId", "${target}Id" AS "recordId" FROM "RecordLink" WHERE "companyId" = $1 AND "relationId" = $2 AND "${owner}TypeId" = $3 AND "${owner}Id" = $4 ORDER BY "${target}Id" LIMIT 1000001`,
          [source.companyId, relationId, ref.typeId, ref.recordId],
        ),
      );
      if (result.rows.length > 1000000) throw new Error("Migration calculation exceeds the relationship budget");
      return result.rows;
    },
    optionAttribute: async (ref, fieldId, attribute) => {
      const result = await context.field(ref, fieldId);
      if (result.state !== "value") return result;
      if (result.value.kind !== "select") return { state: "error", code: "type_mismatch" };
      const selected = result.value.value;
      return valueResult(
        fields
          .get(fieldId)
          ?.options.find((option) => option.id === selected)
          ?.attributes.find((candidate) => candidate.key === attribute)?.value ?? null,
      );
    },
  };
  let calculated = 0;
  for (const fieldId of validateRecordModel(source.model).calculationOrder) {
    const field = fields.get(fieldId);
    if (!field || field.behavior.kind === "input" || field.behavior.kind === "snapshot") continue;
    let afterId = "";
    for (;;) {
      const page = await client.query(
        'SELECT id, "createdAt", "updatedAt" FROM "CrmRecord" WHERE "companyId" = $1 AND "typeId" = $2 AND id > $3 ORDER BY id LIMIT 100',
        [source.companyId, field.typeId, afterId],
      );
      if (!page.rows.length) break;
      const values: MigrationValue[] = [];
      for (const row of page.rows) {
        let result = await evaluateCalculation(
          field.behavior.expression,
          { typeId: field.typeId, recordId: row.id },
          context,
        );
        if (
          result.state === "value" &&
          result.value.kind === "decimal" &&
          field.valueType === "currency" &&
          result.value.currency === null &&
          result.value.value === "0"
        ) {
          result = valueResult({
            ...result.value,
            currency: field.format?.currency ?? source.currency,
          });
        }
        if (result.state === "value" && !scalarMatchesType(result.value, field.valueType, field.multiple))
          throw new Error("Migration calculation produced an incompatible value");
        if (result.state === "error" || result.state === "restricted") throw new Error("Migration calculation failed");
        values.push({
          typeId: field.typeId,
          recordId: row.id,
          fieldId,
          result,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
      await writeMigrationValues(client, source.companyId, values);
      calculated += values.length;
      afterId = page.rows[page.rows.length - 1].id;
    }
  }
  return calculated;
}
