import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import { recordReadPredicate } from "@/features/records/record-query";
import { RecordWriteError } from "@/features/records/record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { parseRecordReferenceKey } from "@/features/records/record-reference-key";
import { presetId } from "@/features/records/crm-preset";

export function compileMessagingRecordQuery(
  companyId: string,
  userId: string,
  params: GetQueryParams,
  model: RecordModel,
  access: RecordAccessMap,
): Prisma.Sql {
  const bound = new Set(
    model.capabilities.filter((binding) => binding.kind === "personIdentity").map((binding) => binding.typeId),
  );
  const readable = model.types
    .filter((type) => !type.archived && bound.has(type.id))
    .map(
      (type) =>
        Prisma.sql`(record."typeId" = ${type.id} AND ${recordReadPredicate(companyId, access.get(type.id) ?? { access: "none", userId }, Prisma.sql`record`)})`,
    );
  const linked = (refs?: RecordRef[]) => Prisma.sql`EXISTS (
    SELECT 1 FROM "RecordIdentityKey" identity_key
    JOIN "RecordIdentity" identity ON identity."companyId" = ${companyId} AND identity.id = identity_key."identityId"
    JOIN "CrmRecord" record ON record."companyId" = ${companyId} AND record."typeId" = identity."typeId" AND record.id = identity."recordId"
    WHERE identity_key."companyId" = ${companyId}
      AND identity_key."channelClass" = CASE WHEN participant.provider IN ('mail', 'google', 'outlook') THEN 'email' WHEN participant.provider = 'whatsapp' THEN 'phone' ELSE participant.provider::text END
      AND identity_key.value = participant."identityLookupValue"
      AND (${readable.length ? Prisma.join(readable, " OR ") : Prisma.sql`FALSE`})
      AND ${
        refs
          ? refs.length
            ? Prisma.sql`(${Prisma.join(
                refs.map((ref) => Prisma.sql`(record."typeId" = ${ref.typeId} AND record.id = ${ref.recordId})`),
                " OR ",
              )})`
            : Prisma.sql`FALSE`
          : Prisma.sql`TRUE`
      }
  )`;
  const participant = (
    predicate: Prisma.Sql,
  ) => Prisma.sql`EXISTS (SELECT 1 FROM "MessagingThreadParticipant" participant
    WHERE participant."companyId" = ${companyId} AND participant."messagingThreadId" = thread.id AND NOT participant."isSelf"
      AND participant.identifier IS NOT NULL AND trim(participant.identifier) <> '' AND ${predicate})`;
  const messageVisible = Prisma.sql`NOT message."isHidden" AND (account."foldersSyncedAt" IS NULL OR cardinality(message."folderIds") = 0 OR message."folderIds" && account."selectedFolderIds")`;
  const filters = (params.filters ?? []).map((filter): Prisma.Sql => {
    const fieldKey = filter.field as FilterFieldKey;
    if (
      ![
        FilterFieldKey.state,
        FilterFieldKey.provider,
        FilterFieldKey.draft,
        FilterFieldKey.participants,
        FilterFieldKey.participantContactId,
      ].includes(fieldKey) ||
      !FILTER_FIELD_DEFAULT_OPERATORS[fieldKey]?.includes(filter.operator)
    )
      throw new RecordWriteError(CustomErrorCode.invalidFilterField);
    if (fieldKey === FilterFieldKey.participants) {
      const unlinked = participant(Prisma.sql`NOT ${linked()}`);
      return filter.operator === FilterOperatorKey.hasUnset
        ? unlinked
        : Prisma.sql`(${participant(linked())} AND NOT ${unlinked})`;
    }
    if (fieldKey === FilterFieldKey.participantContactId) {
      const refs = values(filter).map((value) => {
        const ref = parseRecordReferenceKey(value);
        if (ref) return ref;
        if (z.uuid().safeParse(value).success) return { typeId: presetId(companyId, "contact"), recordId: value };
        throw new RecordWriteError(CustomErrorCode.invalidFilterField);
      });
      const match = participant(linked(refs));
      return filter.operator === FilterOperatorKey.notIn ? Prisma.sql`NOT ${match}` : match;
    }
    if (fieldKey === FilterFieldKey.draft) {
      const match = Prisma.sql`EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."companyId" = ${companyId} AND message."messagingThreadId" = thread.id AND message."isDraft")`;
      return filter.operator === FilterOperatorKey.hasNone ? Prisma.sql`NOT ${match}` : match;
    }
    const field = fieldKey === FilterFieldKey.state ? Prisma.sql`thread.state` : Prisma.sql`thread.provider`;
    const selected = values(filter);
    const match = selected.length ? Prisma.sql`${field}::text IN (${Prisma.join(selected)})` : Prisma.sql`FALSE`;
    return filter.operator === FilterOperatorKey.notIn ? Prisma.sql`NOT (${match})` : match;
  });
  const term = params.searchTerm?.trim();
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(Prisma.sql`(thread.subject ILIKE ${pattern} OR thread.name ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."companyId" = ${companyId} AND message."messagingThreadId" = thread.id AND ${messageVisible} AND message."bodyText" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "MessagingThreadParticipant" participant WHERE participant."companyId" = ${companyId} AND participant."messagingThreadId" = thread.id AND (participant."displayName" ILIKE ${pattern} OR participant.identifier ILIKE ${pattern})))`);
  }
  const query = Prisma.sql`FROM "MessagingThread" thread
    JOIN "ConnectedAccount" account ON account."companyId" = ${companyId} AND account.id = thread."connectedAccountId"
    WHERE thread."companyId" = ${companyId} AND (account."userId" = ${userId} OR account.shared OR thread."sharedToCrm")
      AND (thread."lastMessageAt" IS NOT NULL OR EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."companyId" = ${companyId} AND message."messagingThreadId" = thread.id AND message."isDraft"))
      AND (account."foldersSyncedAt" IS NULL OR EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."companyId" = ${companyId} AND message."messagingThreadId" = thread.id AND ${messageVisible}))
      AND (${filters.length ? Prisma.join(filters, " AND ") : Prisma.sql`TRUE`})`;
  if (query.values.length > 12000) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
  return query;
}

function values(filter: Filter): string[] {
  if (!("value" in filter)) return [];
  const selected = Array.isArray(filter.value) ? filter.value : [String(filter.value)];
  if (selected.length > 100) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
  return selected;
}
