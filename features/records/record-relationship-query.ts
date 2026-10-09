import { Prisma } from "@/generated/prisma";

import type { RecordModel } from "./record-model.schema";
import type { RecordAccessMap } from "./record-query.schema";
import type { RecordRelationshipSelection } from "./record-column.schema";

import { fieldReadPredicate, recordReadPredicate } from "./record-query";

export type RecordRelationshipRow = {
  ownerId: string;
  relationId: string;
  direction: "incoming" | "outgoing";
  typeId: string;
  recordId: string;
  state: string;
  title: string | null;
  errorCode: string | null;
  readableCount: number;
};

export function compileRecordRelationshipSummaries(
  companyId: string,
  typeId: string,
  recordIds: string[],
  selections: RecordRelationshipSelection[],
  model: RecordModel,
  access: RecordAccessMap,
): Prisma.Sql | null {
  if (!recordIds.length || !selections.length) return null;
  const source = Prisma.sql`source`;
  const target = Prisma.sql`target`;
  const ownerScope = access.get(typeId) ?? { access: "none" as const, userId: "" };
  const branches = selections.map((selection) => {
    const relation = model.relationships.find(
      (candidate) => candidate.id === selection.relationId && !candidate.archived,
    );
    const outgoing = selection.direction === "outgoing";
    if (!relation || (outgoing ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
      throw new Error("Relationship projection must be validated before compilation");
    const targetTypeId = outgoing ? relation.targetTypeId : relation.sourceTypeId;
    const type = model.types.find((candidate) => candidate.id === targetTypeId && !candidate.archived);
    const title = model.fields.find((field) => field.id === type?.primaryFieldId && !field.archived);
    const targetScope = access.get(targetTypeId) ?? { access: "none" as const, userId: "" };
    const sourceLink = outgoing ? Prisma.sql`link."sourceId"` : Prisma.sql`link."targetId"`;
    const targetLink = outgoing ? Prisma.sql`link."targetId"` : Prisma.sql`link."sourceId"`;
    const canReadTitle = title ? fieldReadPredicate(companyId, title, model, access, target) : Prisma.sql`TRUE`;
    return Prisma.sql`SELECT "ownerId", "relationId", direction, "typeId", "recordId", state, title, "errorCode", "readableCount" FROM (
      SELECT source.id AS "ownerId", ${selection.relationId}::text AS "relationId", ${selection.direction}::text AS direction,
        target."typeId", target.id AS "recordId",
        CASE WHEN ${canReadTitle} THEN COALESCE(value.state, 'missing') ELSE 'restricted' END AS state,
        CASE WHEN ${canReadTitle} AND value.state = 'value' THEN value."textValue" ELSE NULL END AS title,
        CASE WHEN ${canReadTitle} AND value.state = 'error' THEN value."errorCode" ELSE NULL END AS "errorCode",
        COUNT(*) OVER (PARTITION BY source.id)::integer AS "readableCount",
        ROW_NUMBER() OVER (PARTITION BY source.id ORDER BY target.id) AS ordinal
      FROM owners source
      JOIN "RecordLink" link ON link."companyId" = ${companyId} AND link."relationId" = ${relation.id} AND ${sourceLink} = source.id
        AND link."sourceTypeId" = ${relation.sourceTypeId} AND link."targetTypeId" = ${relation.targetTypeId}
      JOIN "CrmRecord" target ON target."companyId" = ${companyId} AND target."typeId" = ${targetTypeId} AND target.id = ${targetLink}
      LEFT JOIN "RecordValue" value ON value."companyId" = ${companyId} AND value."typeId" = target."typeId" AND value."recordId" = target.id AND value."fieldId" = ${title?.id ?? null}
      WHERE ${recordReadPredicate(companyId, targetScope, target)}
    ) related WHERE ordinal <= ${selection.limit}`;
  });
  return Prisma.sql`WITH owners AS (
    SELECT source.* FROM "CrmRecord" source WHERE source."companyId" = ${companyId} AND source."typeId" = ${typeId}
      AND source.id IN (${Prisma.join(recordIds)}) AND ${recordReadPredicate(companyId, ownerScope, source)}
  ) ${Prisma.join(branches, " UNION ALL ")} ORDER BY "ownerId", "relationId", direction, "recordId"`;
}
