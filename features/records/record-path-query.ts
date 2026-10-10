import { Prisma } from "@/generated/prisma";

import type { RecordModel } from "./record-model.schema";
import type { RecordAccessMap } from "./record-query.schema";
import type { RecordPathStep, RecordPathSelection } from "./record-relationship-path.schema";

import { resolveRecordPath } from "./record-relationship-path";
import { fieldReadPredicate, recordReadPredicate } from "./record-query";

export function recordPathJoins(
  companyId: string,
  typeId: string,
  path: RecordPathStep[],
  model: RecordModel,
  access: RecordAccessMap,
  owner: Prisma.Sql,
  left = false,
) {
  const steps = resolveRecordPath(typeId, path, model);
  if (!steps) throw new Error("Relationship path must be validated before compilation");
  const joins: Prisma.Sql[] = [];
  const restricted: Prisma.Sql[] = [];
  let target = owner;
  for (const [index, step] of steps.entries()) {
    const parent = target;
    const link = Prisma.raw(`"path_link_${index}"`);
    target = Prisma.raw(`"path_record_${index}"`);
    const sourceId = step.direction === "outgoing" ? Prisma.sql`${link}."sourceId"` : Prisma.sql`${link}."targetId"`;
    const targetId = step.direction === "outgoing" ? Prisma.sql`${link}."targetId"` : Prisma.sql`${link}."sourceId"`;
    const scope = access.get(step.typeId) ?? { userId: "", access: "none" as const };
    const join = left ? Prisma.sql`LEFT JOIN` : Prisma.sql`JOIN`;
    joins.push(Prisma.sql`${join} "RecordLink" ${link} ON ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${step.relation.id} AND ${link}."deletedAt" IS NULL
      AND ${link}."sourceTypeId" = ${step.relation.sourceTypeId} AND ${link}."targetTypeId" = ${step.relation.targetTypeId} AND ${sourceId} = ${parent}.id
      ${join} "CrmRecord" ${target} ON ${target}."companyId" = ${companyId} AND ${target}."typeId" = ${step.typeId} AND ${target}.id = ${targetId}
        AND ${recordReadPredicate(companyId, scope, target)}`);
    restricted.push(Prisma.sql`(${link}.id IS NOT NULL AND ${target}.id IS NULL)`);
  }
  return {
    joins: Prisma.join(joins, " "),
    target,
    typeId: steps.at(-1)?.typeId ?? typeId,
    restricted: Prisma.sql`(${Prisma.join(restricted, " OR ")})`,
  };
}

export type RecordPathRow = {
  ownerId: string;
  pathId: string;
  typeId: string;
  recordId: string;
  state: string;
  title: string | null;
  errorCode: string | null;
  readableCount: number;
};

export function compileRecordPathSummaries(
  companyId: string,
  typeId: string,
  recordIds: string[],
  selections: RecordPathSelection[],
  model: RecordModel,
  access: RecordAccessMap,
): Prisma.Sql | null {
  if (!recordIds.length || !selections.length) return null;
  const owner = Prisma.sql`owner`;
  const scope = access.get(typeId) ?? { userId: "", access: "none" as const };
  const definitions = model.types.find((type) => type.id === typeId)?.relationshipPaths ?? [];
  const branches = selections.map((selection) => {
    const definition = definitions.find((definition) => definition.id === selection.pathId && !definition.archived);
    if (!definition) throw new Error("Relationship path must be validated before compilation");
    const path = recordPathJoins(companyId, typeId, definition.path, model, access, owner);
    const type = model.types.find((type) => type.id === path.typeId && !type.archived);
    const title = model.fields.find((field) => field.id === type?.primaryFieldId && !field.archived);
    const target = Prisma.sql`target`;
    const readable = title ? fieldReadPredicate(companyId, title, model, access, target) : Prisma.sql`TRUE`;
    return Prisma.sql`SELECT "ownerId", ${definition.id}::text AS "pathId", "typeId", "recordId", state, title, "errorCode", "readableCount" FROM (
      SELECT target."ownerId", target."typeId", target.id AS "recordId",
        CASE WHEN ${readable} THEN COALESCE(value.state, 'missing') ELSE 'restricted' END AS state,
        CASE WHEN ${readable} AND value.state = 'value' THEN value."textValue" ELSE NULL END AS title,
        CASE WHEN ${readable} AND value.state = 'error' THEN value."errorCode" ELSE NULL END AS "errorCode",
        COUNT(*) OVER (PARTITION BY target."ownerId")::integer AS "readableCount",
        ROW_NUMBER() OVER (PARTITION BY target."ownerId" ORDER BY target.id) AS ordinal
      FROM (
        SELECT DISTINCT owner.id AS "ownerId", ${path.target}."typeId", ${path.target}.id
        FROM owners owner ${path.joins}
      ) target
      LEFT JOIN "RecordValue" value ON value."companyId" = ${companyId} AND value."typeId" = target."typeId" AND value."recordId" = target.id AND value."fieldId" = ${title?.id ?? null}
    ) related WHERE ordinal <= ${selection.limit}`;
  });
  return Prisma.sql`WITH owners AS (
    SELECT owner.* FROM "CrmRecord" owner WHERE owner."companyId" = ${companyId} AND owner."typeId" = ${typeId} AND owner."deletedAt" IS NULL
      AND owner.id IN (${Prisma.join(recordIds)}) AND ${recordReadPredicate(companyId, scope, owner)}
  ) ${Prisma.join(branches, " UNION ALL ")} ORDER BY "ownerId", "pathId", "recordId"`;
}
