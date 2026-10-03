import type { ClientBase } from "pg";
import type { CalculationExpression, RecordModel, RecordRef } from "../v2/contract/record-model.schema";
import { presetId } from "../v2/contract/crm-preset";

export async function backfillCalculationProvenance(client: ClientBase, companyId: string, model: RecordModel) {
  let checkedValues = 0;
  let dependencyCount = 0;
  const fields = new Map(model.fields.map((field) => [field.id, field]));
  for (const field of model.fields) {
    if (field.behavior.kind === "input") continue;
    let afterId = "";
    for (;;) {
      const page = await client.query<{ recordId: string }>(
        'SELECT "recordId" FROM "RecordValue" WHERE "companyId" = $1 AND "typeId" = $2 AND "fieldId" = $3 AND "recordId" > $4 ORDER BY "recordId" LIMIT 100',
        [companyId, field.typeId, field.id, afterId],
      );
      if (!page.rows.length) break;
      for (const row of page.rows) {
        const dependencies = new Map<string, RecordRef>();
        let steps = 0;
        const visit = async (expression: CalculationExpression, ref: RecordRef): Promise<void> => {
          if (++steps > 2000000) throw new Error("Migration calculation provenance exceeds the operation budget");
          if (expression.kind === "literal") return;
          if (expression.kind === "operation") {
            for (const argument of expression.arguments) await visit(argument, ref);
            return;
          }
          if (expression.kind === "related") {
            const owner = expression.direction === "outgoing" ? "source" : "target";
            const target = expression.direction === "outgoing" ? "target" : "source";
            const refs = await client.query<RecordRef>(
              `SELECT "${target}TypeId" AS "typeId", "${target}Id" AS "recordId" FROM "RecordLink" WHERE "companyId" = $1 AND "relationId" = $2 AND "${owner}TypeId" = $3 AND "${owner}Id" = $4 ORDER BY "${target}Id" LIMIT 1000001`,
              [companyId, expression.relationId, ref.typeId, ref.recordId],
            );
            if (refs.rows.length > 1000000) throw new Error("Migration relationship exceeds the operation budget");
            for (const related of refs.rows) {
              dependencies.set(`${related.typeId}:${related.recordId}`, related);
              if (dependencies.size > 1000000) throw new Error("Migration provenance exceeds the operation budget");
              await visit(expression.expression, related);
            }
            return;
          }
          const source = fields.get(expression.fieldId);
          if (!source || source.typeId !== ref.typeId) throw new Error("Migration references an unknown source field");
          if (source.publishedSummary || source.behavior.kind === "input" || source.behavior.kind === "snapshot")
            return;
          await visit(source.behavior.expression, ref);
        };
        await visit(field.behavior.expression, { typeId: field.typeId, recordId: row.recordId });
        const refs = [...dependencies.values()];
        for (let offset = 0; offset < refs.length; offset += 500) {
          await client.query(
            'INSERT INTO "RecordValueDependency" ("companyId", "typeId", "recordId", "fieldId", "sourceTypeId", "sourceId") SELECT $1, $2, $3, $4, source."typeId", source."recordId" FROM jsonb_to_recordset($5::jsonb) AS source("typeId" text, "recordId" text)',
            [companyId, field.typeId, row.recordId, field.id, JSON.stringify(refs.slice(offset, offset + 500))],
          );
        }
        checkedValues++;
        dependencyCount += refs.length;
      }
      afterId = page.rows[page.rows.length - 1].recordId;
    }
  }
  return { checkedValues, dependencyCount };
}

export async function reconcileCalculationProvenance(client: ClientBase, companyId: string) {
  const id = (key: string) => presetId(companyId, key);
  const result = await client.query(
    `WITH expected AS (
      SELECT $2::text AS "typeId", line.id AS "recordId", field.id AS "fieldId", $3::text AS "sourceTypeId", line."serviceId" AS "sourceId"
      FROM "ServiceDeal" line CROSS JOIN (VALUES ($4::text), ($5::text)) field(id) WHERE line."companyId" = $1
      UNION
      SELECT $6, line."dealId", $7, $2, line.id FROM "ServiceDeal" line WHERE line."companyId" = $1
      UNION
      SELECT $6, line."dealId", $7, $3, line."serviceId" FROM "ServiceDeal" line WHERE line."companyId" = $1
      UNION
      SELECT $6, line."dealId", $8, $2, line.id FROM "ServiceDeal" line WHERE line."companyId" = $1
    ), actual AS (
      SELECT "typeId", "recordId", "fieldId", "sourceTypeId", "sourceId" FROM "RecordValueDependency" WHERE "companyId" = $1
    ), mismatches AS (
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    ) SELECT "typeId", "recordId", "fieldId" FROM mismatches GROUP BY "typeId", "recordId", "fieldId" ORDER BY "typeId", "recordId", "fieldId"`,
    [
      companyId,
      id("lineItem"),
      id("service"),
      id("lineItem.effectivePrice"),
      id("lineItem.amount"),
      id("deal"),
      id("deal.totalValue"),
      id("deal.totalQuantity"),
    ],
  );
  return result.rows.map((row) => ({
    table: "RecordValueDependency",
    id: row.recordId as string,
    field: row.fieldId as string,
    code: "provenance_mismatch",
  }));
}
