import { Prisma } from "@/generated/prisma";

import type { RecordModel } from "./record-model.schema";
import type { RecordAccessMap } from "./record-query.schema";

import { fieldReadPredicate } from "./record-query";

export function recordPictureField(model: Pick<RecordModel, "capabilities" | "fields">, typeId: string) {
  const fieldId = model.capabilities
    .find((binding) => binding.kind === "avatar" && binding.typeId === typeId)
    ?.fields.find((field) => field.role === "image")?.fieldId;
  return model.fields.find((field) => field.id === fieldId && !field.archived);
}

export function recordPictureSql(
  companyId: string,
  typeId: string | undefined,
  model: RecordModel,
  access: RecordAccessMap,
  record: Prisma.Sql,
) {
  const picture = typeId ? recordPictureField(model, typeId) : undefined;
  if (!picture) return Prisma.sql`NULL::text`;
  return Prisma.sql`CASE WHEN ${fieldReadPredicate(companyId, picture, model, access, record)} THEN
      (SELECT value."textValue" FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${picture.typeId}
        AND value."recordId" = ${record}.id AND value."fieldId" = ${picture.id} AND value.state = 'value') ELSE NULL END`;
}
