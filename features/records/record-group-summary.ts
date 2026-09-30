import { Prisma } from "@/generated/prisma";

import type { RecordModel, RecordGroupSummaryDefinition } from "./record-model.schema";
import type { RecordAccessMap } from "./record-query.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write.service";
import { fieldReadPredicate } from "./record-query";

export function recordGroupSummaryCtes(
  companyId: string,
  typeId: string,
  definitions: RecordGroupSummaryDefinition[],
  model: RecordModel,
  access: RecordAccessMap,
  currency: string,
): Prisma.Sql {
  if (!definitions.length) return Prisma.empty;
  const queries = definitions.map((definition, index) => {
    const field = model.fields.find(
      (field) => field.id === definition.fieldId && field.typeId === typeId && !field.archived,
    );
    if (!field || !["number", "currency"].includes(field.valueType))
      throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
    const operators = { sum: "SUM", average: "AVG", min: "MIN", max: "MAX" } as const;
    const readable = fieldReadPredicate(companyId, field, model, access, Prisma.sql`grain`);
    const value = Prisma.sql`CASE WHEN amount.state = 'value' THEN amount."decimalValue" ELSE NULL END`;
    const amount = Prisma.sql`${Prisma.raw(operators[definition.aggregation])}(${value})`;
    const emptySum = definition.aggregation === "sum" ? Prisma.sql`COUNT(grain.id) = 0` : Prisma.sql`FALSE`;
    return Prisma.sql`SELECT axis.key, ${index}::integer AS position,
      jsonb_build_object('fieldId', ${field.id}::text, 'label', ${field.label}::text,
        'aggregation', ${definition.aggregation}::text, 'decimalPlaces', ${field.format?.decimalPlaces ?? null}::integer,
        'result', CASE
          WHEN BOOL_OR(grain.id IS NOT NULL AND NOT (${readable})) THEN jsonb_build_object('state', 'restricted')
          WHEN BOOL_OR(amount.state = 'error') THEN jsonb_build_object('state', 'error', 'code', 'dependency_error')
          WHEN COUNT(DISTINCT amount.currency) FILTER (WHERE amount.state = 'value') > 1 THEN jsonb_build_object('state', 'error', 'code', 'currency_mismatch')
          WHEN COUNT(${value}) = 0 AND NOT (${emptySum}) THEN jsonb_build_object('state', 'missing')
          ELSE jsonb_build_object('state', 'value', 'value', jsonb_build_object('kind', 'decimal',
            'value', trim_scale(COALESCE(${amount}, 0))::text,
            'currency', ${
              field.valueType === "currency"
                ? Prisma.sql`COALESCE(MAX(amount.currency) FILTER (WHERE amount.state = 'value'), ${field.format?.currency ?? currency.toUpperCase()})`
                : Prisma.sql`NULL::text`
            })) END) AS summary
      FROM page_axis axis LEFT JOIN members grain ON grain.key = axis.key
      LEFT JOIN "RecordValue" amount ON amount."companyId" = ${companyId} AND amount."typeId" = ${typeId}
        AND amount."recordId" = grain.id AND amount."fieldId" = ${field.id}
      GROUP BY axis.key`;
  });
  return Prisma.sql`summary_values AS (${Prisma.join(queries, " UNION ALL ")}),
    summary_groups AS (SELECT key, jsonb_agg(summary ORDER BY position) AS summaries FROM summary_values GROUP BY key),`;
}
