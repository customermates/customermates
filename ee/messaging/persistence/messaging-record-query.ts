import { startOfDay, subDays } from "date-fns";
import { z } from "zod";
import { MessagingMessageDirection, Prisma } from "@/generated/prisma";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import { recordReadPredicate } from "@/features/records/record-query";
import { recordChannelsTypeIds } from "@/features/records/record-channels";
import { RecordWriteError } from "@/features/records/record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { parseRecordReferenceKey } from "@/features/records/record-reference-key";
import { presetId } from "@/features/records/crm-preset";
import { parseEmailFolderFilterValue } from "../inbox/messaging-filter-options.schema";

const SUPPORTED_FIELDS = [
  FilterFieldKey.state,
  FilterFieldKey.provider,
  FilterFieldKey.draft,
  FilterFieldKey.participants,
  FilterFieldKey.participantContactId,
  FilterFieldKey.connectedAccountId,
  FilterFieldKey.emailFolder,
  FilterFieldKey.lastMessageDirection,
  FilterFieldKey.lastMessageSentAt,
  FilterFieldKey.lastMessageAt,
];

export function compileMessagingRecordQuery(
  companyId: string,
  userId: string,
  params: GetQueryParams,
  model: RecordModel,
  access: RecordAccessMap,
): Prisma.Sql {
  const bound = new Set(recordChannelsTypeIds(model));
  const readable = model.types
    .filter((type) => bound.has(type.id))
    .map(
      (type) =>
        Prisma.sql`(record."typeId" = ${type.id} AND ${recordReadPredicate(companyId, access.get(type.id) ?? { access: "none", userId }, Prisma.sql`record`)})`,
    );
  const linked = (refs?: RecordRef[]) => Prisma.sql`EXISTS (
    SELECT 1 FROM "RecordIdentityKey" identity_key
    JOIN "RecordIdentity" identity ON identity."companyId" = ${companyId} AND identity.id = identity_key."identityId"
    JOIN "RecordIdentityLink" association ON association."companyId" = ${companyId} AND association."identityId" = identity.id
    JOIN "CrmRecord" record ON record."companyId" = ${companyId} AND record."typeId" = association."typeId" AND record.id = association."recordId"
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
    WHERE participant."messagingThreadId" = thread.id AND participant."companyId" = thread."companyId" AND NOT participant."isSelf"
      AND participant.identifier IS NOT NULL AND trim(participant.identifier) <> '' AND ${predicate})`;
  const messageVisible = Prisma.sql`NOT message."isHidden" AND (account."foldersSyncedAt" IS NULL OR cardinality(message."folderIds") = 0 OR message."folderIds" && account."selectedFolderIds")`;
  const now = new Date();
  const lastMessageFilters: Filter[] = [];
  const filters = (params.filters ?? []).flatMap((filter): Prisma.Sql[] => {
    const fieldKey = filter.field as FilterFieldKey;
    if (!SUPPORTED_FIELDS.includes(fieldKey) || !FILTER_FIELD_DEFAULT_OPERATORS[fieldKey]?.includes(filter.operator))
      throw new RecordWriteError(CustomErrorCode.invalidFilterField);
    if (fieldKey === FilterFieldKey.lastMessageDirection || fieldKey === FilterFieldKey.lastMessageSentAt) {
      lastMessageFilters.push(filter);
      return [];
    }
    if (fieldKey === FilterFieldKey.lastMessageAt)
      return [dateCondition(Prisma.sql`thread."lastMessageAt"`, filter, now)];
    if (fieldKey === FilterFieldKey.emailFolder) {
      const references = values(filter).map(parseEmailFolderFilterValue);
      if (references.length === 0 || references.some((reference) => reference === null)) return [Prisma.sql`FALSE`];
      const membership = Prisma.join(
        references.flatMap((reference) =>
          reference
            ? [
                Prisma.sql`(thread."connectedAccountId" = ${reference.accountId} AND EXISTS (SELECT 1 FROM "MessagingMessage" message
                  WHERE message."messagingThreadId" = thread.id AND message."companyId" = thread."companyId" AND ${messageVisible}
                    AND ${reference.folderId} = ANY(message."folderIds")))`,
              ]
            : [],
        ),
        " OR ",
      );
      return [
        filter.operator === FilterOperatorKey.notIn ? Prisma.sql`NOT (${membership})` : Prisma.sql`(${membership})`,
      ];
    }
    if (fieldKey === FilterFieldKey.participants) {
      const unlinked = participant(Prisma.sql`NOT ${linked()}`);
      return [
        filter.operator === FilterOperatorKey.hasUnset
          ? unlinked
          : Prisma.sql`(${participant(linked())} AND NOT ${unlinked})`,
      ];
    }
    if (fieldKey === FilterFieldKey.participantContactId) {
      const refs = values(filter).map((value) => {
        const ref = parseRecordReferenceKey(value);
        if (ref) return ref;
        if (z.uuid().safeParse(value).success) return { typeId: presetId(companyId, "contact"), recordId: value };
        throw new RecordWriteError(CustomErrorCode.invalidFilterField);
      });
      const match = participant(linked(refs));
      return [filter.operator === FilterOperatorKey.notIn ? Prisma.sql`NOT ${match}` : match];
    }
    if (fieldKey === FilterFieldKey.draft) {
      const match = Prisma.sql`EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."messagingThreadId" = thread.id AND message."companyId" = thread."companyId" AND message."isDraft")`;
      return [filter.operator === FilterOperatorKey.hasNone ? Prisma.sql`NOT ${match}` : match];
    }
    const field =
      fieldKey === FilterFieldKey.state
        ? Prisma.sql`thread.state::text`
        : fieldKey === FilterFieldKey.provider
          ? Prisma.sql`thread.provider::text`
          : Prisma.sql`thread."connectedAccountId"`;
    const selected = values(filter);
    const match = selected.length ? Prisma.sql`${field} IN (${Prisma.join(selected)})` : Prisma.sql`FALSE`;
    return [filter.operator === FilterOperatorKey.notIn ? Prisma.sql`NOT (${match})` : match];
  });
  if (lastMessageFilters.length) filters.push(lastActualMessageCondition(lastMessageFilters, now));
  const term = params.searchTerm?.trim();
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(Prisma.sql`(thread.subject ILIKE ${pattern} OR thread.name ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."messagingThreadId" = thread.id AND message."companyId" = thread."companyId" AND ${messageVisible} AND message."bodyText" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "MessagingThreadParticipant" participant WHERE participant."messagingThreadId" = thread.id AND participant."companyId" = thread."companyId" AND (participant."displayName" ILIKE ${pattern} OR participant.identifier ILIKE ${pattern})))`);
  }
  const query = Prisma.sql`FROM "MessagingThread" thread
    JOIN "ConnectedAccount" account ON account."companyId" = ${companyId} AND account.id = thread."connectedAccountId"
    WHERE thread."companyId" = ${companyId} AND (account."userId" = ${userId} OR account.shared OR thread."sharedToCrm")
      AND (thread."lastMessageAt" IS NOT NULL OR EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."messagingThreadId" = thread.id AND message."companyId" = thread."companyId" AND message."isDraft"))
      AND (account."foldersSyncedAt" IS NULL OR EXISTS (SELECT 1 FROM "MessagingMessage" message WHERE message."messagingThreadId" = thread.id AND message."companyId" = thread."companyId" AND ${messageVisible}))
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

function lastActualMessageCondition(filters: Filter[], now: Date): Prisma.Sql {
  const validDirections: string[] = Object.values(MessagingMessageDirection);
  let directions = validDirections;
  const conditions: Prisma.Sql[] = [];
  for (const filter of filters) {
    if (filter.field === FilterFieldKey.lastMessageSentAt.toString()) {
      conditions.push(dateCondition(Prisma.sql`latest."sentAt"`, filter, now));
      continue;
    }
    const selected = values(filter);
    if (selected.length === 0 || selected.some((value) => !validDirections.includes(value))) return Prisma.sql`FALSE`;
    directions = directions.filter((direction) =>
      filter.operator === FilterOperatorKey.notIn ? !selected.includes(direction) : selected.includes(direction),
    );
  }
  if (directions.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`EXISTS (SELECT 1 FROM (
      SELECT message.direction, message."sentAt"
      FROM "MessagingMessage" message
      WHERE message."messagingThreadId" = thread.id AND message."companyId" = thread."companyId"
        AND message."connectedAccountId" = thread."connectedAccountId"
        AND NOT message."isDraft" AND NOT message."isHidden" AND NOT message."isDeleted" AND NOT message."isEvent"
        AND (account."foldersSyncedAt" IS NULL OR cardinality(message."folderIds") = 0
          OR message."folderIds" && account."selectedFolderIds")
      ORDER BY message."sentAt" DESC, message.id DESC
      LIMIT 1
    ) latest
    WHERE latest.direction::text IN (${Prisma.join(directions)})
      ${conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty})`;
}

function dateCondition(column: Prisma.Sql, filter: Filter, now: Date): Prisma.Sql {
  if (filter.operator === FilterOperatorKey.inLastDays || filter.operator === FilterOperatorKey.notInLastDays) {
    const cutoff = startOfDay(subDays(now, Number(filter.value)));
    if (Number.isNaN(cutoff.getTime())) return Prisma.sql`FALSE`;
    return filter.operator === FilterOperatorKey.inLastDays
      ? Prisma.sql`${column} >= ${cutoff}`
      : Prisma.sql`${column} < ${cutoff}`;
  }
  const dates = values(filter).map((value) => new Date(value));
  if (dates.length === 0 || dates.some((date) => Number.isNaN(date.getTime()))) return Prisma.sql`FALSE`;
  switch (filter.operator) {
    case FilterOperatorKey.gt:
      return Prisma.sql`${column} > ${dates[0]}`;
    case FilterOperatorKey.gte:
      return Prisma.sql`${column} >= ${dates[0]}`;
    case FilterOperatorKey.lt:
      return Prisma.sql`${column} < ${dates[0]}`;
    case FilterOperatorKey.lte:
      return Prisma.sql`${column} <= ${dates[0]}`;
    case FilterOperatorKey.between:
      return dates.length === 2 ? Prisma.sql`${column} >= ${dates[0]} AND ${column} <= ${dates[1]}` : Prisma.sql`FALSE`;
    default:
      return Prisma.sql`FALSE`;
  }
}
