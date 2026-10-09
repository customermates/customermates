import { Prisma } from "@/generated/prisma";
import type { RecordModel, RecordRef } from "./record-model.schema";
import type { RecordAccessMap } from "./record-query.schema";
import type { RecordSearch } from "./record-search.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { compileRecordQuery, fieldReadPredicate, recordReadPredicate } from "./record-query";
import { RecordWriteError } from "./record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";

export type RecordSearchRow = {
  typeId: string;
  recordId: string;
  createdAt: string;
  version: number;
  state: string;
  title: string | null;
  errorCode: string | null;
  protectedKind?: string | null;
  pictureUrl: string | null;
};

export function compileRecordSearch(
  companyId: string,
  model: RecordModel,
  access: RecordAccessMap,
  request: { search: RecordSearch; includeEmbedded?: boolean } | { refs: RecordRef[] },
): Prisma.Sql | null {
  const root = Prisma.sql`record`;
  const types = model.types.filter(
    (type) =>
      !type.archived &&
      access.has(type.id) &&
      access.get(type.id)?.access !== "none" &&
      ("refs" in request
        ? request.refs.some((ref) => ref.typeId === type.id)
        : (!type.embedded || request.includeEmbedded) &&
          (!request.search.typeIds || request.search.typeIds.includes(type.id))),
  );
  const cursor = "search" in request ? request.search.cursor : null;
  const pageLimit = "search" in request ? request.search.limit + 1 : request.refs.length;
  const branches = types.map((type) => {
    const title = model.fields.find((field) => field.id === type.primaryFieldId && !field.archived);
    const titleAccess = title ? fieldReadPredicate(companyId, title, model, access, root) : Prisma.sql`TRUE`;
    const avatarBinding = model.capabilities.find((binding) => binding.kind === "avatar" && binding.typeId === type.id);
    const avatar = model.fields.find(
      (field) => field.id === avatarBinding?.fields.find((field) => field.role === "image")?.fieldId && !field.archived,
    );
    const avatarValue = avatar
      ? Prisma.sql`CASE WHEN ${fieldReadPredicate(companyId, avatar, model, access, root)} THEN
      (SELECT value."textValue" FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${type.id}
        AND value."recordId" = record.id AND value."fieldId" = ${avatar.id} AND value.state = 'value') ELSE NULL END`
      : Prisma.sql`NULL::text`;
    const scope = access.get(type.id) ?? { access: "none" as const, userId: "" };
    const matching =
      "refs" in request
        ? Prisma.sql`SELECT id FROM "CrmRecord" WHERE "companyId" = ${companyId} AND "typeId" = ${type.id} AND "deletedAt" IS NULL
          AND id IN (${Prisma.join(request.refs.filter((ref) => ref.typeId === type.id).map((ref) => ref.recordId))})`
        : compileRecordQuery(
            companyId,
            RecordQuerySchema.parse({ typeId: type.id, search: request.search.searchTerm }),
            model,
            access,
          ).matching;
    const after = cursor
      ? Prisma.sql`(record."createdAt" < (${cursor.createdAt}::timestamptz AT TIME ZONE 'UTC') OR (record."createdAt" = (${cursor.createdAt}::timestamptz AT TIME ZONE 'UTC') AND (${type.id}, record.id) > (${cursor.ref.typeId}, ${cursor.ref.recordId})))`
      : Prisma.sql`TRUE`;
    const candidates = Prisma.sql`WITH matches AS MATERIALIZED (${matching})
      SELECT record.id, record."typeId", record."createdAt", record.version, record."protectedKind" FROM matches matched
      JOIN LATERAL (
        SELECT id, "companyId", "typeId", "createdAt", version, "protectedKind" FROM "CrmRecord"
        WHERE "companyId" = ${companyId} AND "typeId" = ${type.id} AND id = matched.id
        OFFSET 0
      ) record ON TRUE
      WHERE record."companyId" = ${companyId} AND record."typeId" = ${type.id}
        AND ${recordReadPredicate(companyId, scope, root)} AND ${after}
      ORDER BY record."createdAt" DESC, record.id ASC LIMIT ${pageLimit}`;
    return Prisma.sql`SELECT record."typeId", record.id AS "recordId", record."createdAt", record.version, record."protectedKind",
      CASE WHEN ${titleAccess} THEN COALESCE(title.state, 'missing') ELSE 'restricted' END AS state,
      CASE WHEN ${titleAccess} AND title.state = 'value' THEN title."textValue" ELSE NULL END AS title,
      CASE WHEN ${titleAccess} AND title.state = 'error' THEN title."errorCode" ELSE NULL END AS "errorCode",
      ${avatarValue} AS "pictureUrl"
      FROM (${candidates}) record
      LEFT JOIN "RecordValue" title ON title."companyId" = ${companyId} AND title."typeId" = ${type.id}
        AND title."recordId" = record.id AND title."fieldId" = ${title?.id ?? null}`;
  });
  if (!branches.length) return null;
  const after = cursor
    ? Prisma.sql`("createdAt" < (${cursor.createdAt}::timestamptz AT TIME ZONE 'UTC') OR ("createdAt" = (${cursor.createdAt}::timestamptz AT TIME ZONE 'UTC') AND ("typeId", "recordId") > (${cursor.ref.typeId}, ${cursor.ref.recordId})))`
    : Prisma.sql`TRUE`;
  const sql = Prisma.sql`SELECT "typeId", "recordId", to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt", version, state, title, "errorCode", "pictureUrl", "protectedKind"
    FROM (${Prisma.join(branches, " UNION ALL ")}) records WHERE ${after}
    ORDER BY "createdAt" DESC, "typeId" ASC, "recordId" ASC LIMIT ${"search" in request ? request.search.limit + 1 : request.refs.length}`;
  if (sql.values.length > 12000 || sql.sql.length > 1500000)
    throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
  return sql;
}
