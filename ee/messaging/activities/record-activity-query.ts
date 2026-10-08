import { recordChannelsEnabled } from "@/features/records/record-channels";
import { Prisma } from "@/generated/prisma";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import { recordReadPredicate } from "@/features/records/record-query";
import { RecordWriteError } from "@/features/records/record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { ActivityKind } from "./activities.schema";
import type { RecordActivitiesInput } from "./record-activities.schema";
import { systemActivityAuditEvents } from "./system-audit-events";

export type RecordActivityIndexRow = {
  id: string;
  kind: ActivityKind;
  at: string;
};

export function compileRecordActivityScope(
  companyId: string,
  userId: string,
  input: RecordActivitiesInput,
  model: RecordModel,
  access: RecordAccessMap,
): Prisma.Sql {
  const scope = input.scope;
  const restricted = scope.records.length > 0 || scope.typeIds.length > 0;
  const live = (typeId: string) => model.types.some((type) => type.id === typeId && !type.archived);
  const allowed = (typeId: string, record: Prisma.Sql) =>
    recordReadPredicate(companyId, access.get(typeId) ?? { access: "none", userId }, record);
  const roots = model.types.filter(
    (type) =>
      !type.archived &&
      (!restricted || scope.typeIds.includes(type.id) || scope.records.some((ref) => ref.typeId === type.id)),
  );
  const selected = (typeId: string, record: Prisma.Sql) => {
    const ids = scope.records.filter((ref) => ref.typeId === typeId).map((ref) => ref.recordId);
    return !restricted || scope.typeIds.includes(typeId)
      ? Prisma.sql`TRUE`
      : Prisma.sql`${record}.id IN (${Prisma.join(ids)})`;
  };
  const branches = roots.map(
    (type) => Prisma.sql`SELECT record."typeId", record.id, TRUE AS audit,
      ${recordChannelsEnabled(model, type.id)}::boolean AS messaging, TRUE AS threading
      FROM "CrmRecord" record WHERE record."companyId" = ${companyId} AND record."typeId" = ${type.id}
      AND ${selected(type.id, Prisma.sql`record`)} AND ${allowed(type.id, Prisma.sql`record`)}`,
  );
  const sources = model.relationships.flatMap((relationship) =>
    relationship.archived || !live(relationship.sourceTypeId) || !live(relationship.targetTypeId)
      ? []
      : [
          ...(relationship.messagesOnSource ? [{ relationship, outgoing: true }] : []),
          ...(relationship.messagesOnTarget ? [{ relationship, outgoing: false }] : []),
        ],
  );
  for (const [branch, { relationship, outgoing }] of sources.entries()) {
    const rootTypeId = outgoing ? relationship.sourceTypeId : relationship.targetTypeId;
    const linkedTypeId = outgoing ? relationship.targetTypeId : relationship.sourceTypeId;
    if (!roots.some((type) => type.id === rootTypeId) || !restricted || scope.typeIds.includes(linkedTypeId)) continue;
    const root = Prisma.raw(`activity_root_${branch}`);
    const link = Prisma.raw(`activity_link_${branch}`);
    const linked = Prisma.raw(`activity_linked_${branch}`);
    const rootColumn = outgoing ? Prisma.sql`${link}."sourceId"` : Prisma.sql`${link}."targetId"`;
    const linkedColumn = outgoing ? Prisma.sql`${link}."targetId"` : Prisma.sql`${link}."sourceId"`;
    branches.push(Prisma.sql`(WITH ${root} AS MATERIALIZED (
        SELECT ${root}.id FROM "CrmRecord" ${root}
        WHERE ${root}."companyId" = ${companyId} AND ${root}."typeId" = ${rootTypeId}
        AND ${selected(rootTypeId, root)} AND ${allowed(rootTypeId, root)})
      SELECT DISTINCT ${linked}."typeId", ${linked}.id, FALSE AS audit,
        ${recordChannelsEnabled(model, linkedTypeId)}::boolean AS messaging, TRUE AS threading FROM ${root}
      JOIN LATERAL (SELECT * FROM "RecordLink" ${link}
        WHERE ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${relationship.id}
        AND ${link}."sourceTypeId" = ${relationship.sourceTypeId} AND ${link}."targetTypeId" = ${relationship.targetTypeId}
        AND ${rootColumn} = ${root}.id OFFSET 0) ${link} ON TRUE
      JOIN LATERAL (SELECT ${linked}."typeId", ${linked}.id FROM "CrmRecord" ${linked}
        WHERE ${linked}."companyId" = ${companyId} AND ${linked}."typeId" = ${linkedTypeId} AND ${linked}.id = ${linkedColumn}
        AND ${allowed(linkedTypeId, linked)} OFFSET 0) ${linked} ON TRUE)`);
  }
  return branches.length
    ? Prisma.sql`SELECT "typeId", id, bool_or(audit) AS audit, bool_or(messaging) AS messaging, bool_or(threading) AS threading FROM (${Prisma.join(branches, " UNION ALL ")}) expanded GROUP BY "typeId", id`
    : Prisma.sql`SELECT NULL::text AS "typeId", NULL::text AS id, FALSE AS audit, FALSE AS messaging, FALSE AS threading WHERE FALSE`;
}

export function compileRecordActivityIndex(
  companyId: string,
  userId: string,
  input: RecordActivitiesInput,
  model: RecordModel,
  access: RecordAccessMap,
  available: ActivityKind[],
  canReadWiki = false,
): Prisma.Sql {
  const scope = compileRecordActivityScope(companyId, userId, input, model, access);
  const scoped = input.scope.records.length > 0 || input.scope.typeIds.length > 0;
  const filters = input.filters ?? [];
  const enabled = (kind: ActivityKind) =>
    input.kinds.includes(kind) &&
    available.includes(kind) &&
    filters.every(
      (filter) =>
        filter.kind !== "source" ||
        (filter.operator === "in" ? filter.values.includes(kind) : !filter.values.includes(kind)),
    );
  const selected = (kind: "provider" | "account" | "thread", value: Prisma.Sql) => {
    const predicates = filters.flatMap((filter) =>
      filter.kind === kind
        ? [
            filter.operator === "in"
              ? Prisma.sql`${value}::text IN (${Prisma.join(filter.values)})`
              : Prisma.sql`${value}::text NOT IN (${Prisma.join(filter.values)})`,
          ]
        : [],
    );
    if (kind === "provider" && input.providers?.length)
      predicates.push(Prisma.sql`${value}::text IN (${Prisma.join(input.providers)})`);
    if (kind === "thread" && input.threadIds?.length)
      predicates.push(Prisma.sql`${value}::text IN (${Prisma.join(input.threadIds)})`);
    return predicates.length ? Prisma.sql`(${Prisma.join(predicates, " AND ")})` : Prisma.sql`TRUE`;
  };
  const recordFilters = filters.flatMap((filter, index) => {
    if (filter.kind !== "record") return [];
    const activityName = Prisma.raw(`filter_activity_${index}`);
    const historyName = Prisma.raw(`filter_history_${index}`);
    const selection = {
      ...input,
      scope: {
        typeIds: filter.recordIds.length ? [] : [filter.typeId],
        records: filter.recordIds.map((recordId) => ({
          typeId: filter.typeId,
          recordId,
        })),
      },
    };
    return [
      {
        filter,
        activityName,
        historyName,
        cte: Prisma.sql`${activityName} AS (${compileRecordActivityScope(companyId, userId, selection, model, access)}),
      ${historyName} AS (${compileRecordHistoryScope(companyId, selection, model, access, activityName)})`,
      },
    ];
  });
  const matchingRecords = (predicate: (scope: Prisma.Sql, history: Prisma.Sql) => Prisma.Sql) => {
    const predicates = recordFilters.map(({ filter, activityName, historyName }) => {
      const condition = predicate(activityName, historyName);
      return filter.operator === "notIn" || filter.operator === "hasNone" ? Prisma.sql`NOT (${condition})` : condition;
    });
    return predicates.length ? Prisma.sql`(${Prisma.join(predicates, " AND ")})` : Prisma.sql`TRUE`;
  };
  const accountAccess = Prisma.sql`(account."userId" = ${userId} OR account.shared)`;
  const identity = (
    channel: Prisma.Sql,
    value: Prisma.Sql,
    source = Prisma.raw("activity_scope"),
  ) => Prisma.sql`EXISTS (
    SELECT 1 FROM "RecordIdentityKey" identity_key JOIN "RecordIdentity" identity ON identity."companyId" = ${companyId} AND identity.id = identity_key."identityId"
    JOIN "RecordIdentityLink" association ON association."companyId" = ${companyId} AND association."identityId" = identity.id
    JOIN ${source} scope ON scope."typeId" = association."typeId" AND scope.id = association."recordId" AND scope.messaging
    WHERE identity_key."companyId" = ${companyId} AND identity_key."channelClass" = ${channel} AND identity_key.value = ${value})`;
  const messageMatches = (source = Prisma.raw("activity_scope")) => Prisma.sql`(
    EXISTS (SELECT 1 FROM "MessagingThreadParticipant" participant WHERE participant."companyId" = ${companyId} AND participant."messagingThreadId" = thread.id AND NOT participant."isSelf"
      AND ${identity(Prisma.sql`CASE WHEN participant.provider IN ('google', 'mail', 'outlook') THEN 'email' WHEN participant.provider = 'whatsapp' THEN 'phone' ELSE participant.provider::text END`, Prisma.sql`participant."identityLookupValue"`, source)})
    OR EXISTS (SELECT 1 FROM "MessagingThreadRecordLink" association
      JOIN ${source} scope ON scope."typeId" = association."typeId" AND scope.id = association."recordId" AND scope.threading
      WHERE association."companyId" = ${companyId} AND association."threadId" = thread.id)
  )`;
  const calendarMatches = (source = Prisma.raw("activity_scope")) => Prisma.sql`EXISTS (
      SELECT 1 FROM "RecordIdentityKey" identity_key JOIN "RecordIdentity" identity ON identity."companyId" = ${companyId} AND identity.id = identity_key."identityId"
      JOIN "RecordIdentityLink" association ON association."companyId" = ${companyId} AND association."identityId" = identity.id
    JOIN ${source} scope ON scope."typeId" = association."typeId" AND scope.id = association."recordId" AND scope.messaging
      WHERE identity_key."companyId" = ${companyId} AND identity_key."channelClass" = 'email' AND identity_key.value = ANY(event."attendeeEmails"))`;
  const auditMatches = (typeId: Prisma.Sql, recordId: Prisma.Sql) =>
    matchingRecords(
      (_activity, history) => Prisma.sql`EXISTS (
    SELECT 1 FROM ${history} selected_record WHERE selected_record."typeId" = ${typeId} AND selected_record.id = ${recordId})`,
    );
  const accountOrProviderFilter =
    Boolean(input.providers?.length) ||
    filters.some((filter) => filter.kind === "provider" || filter.kind === "account");
  const includedThread =
    Boolean(input.threadIds?.length) || filters.some((filter) => filter.kind === "thread" && filter.operator === "in");
  const branches: Prisma.Sql[] = [];
  const changes = !accountOrProviderFilter && !includedThread;
  const workspace =
    changes &&
    !scoped &&
    recordFilters.every(({ filter }) => filter.operator === "notIn" || filter.operator === "hasNone");
  if (enabled("record") && changes) {
    branches.push(Prisma.sql`SELECT event.id, 'record'::text AS kind, event."createdAt" AS at FROM "EventLog" event
    JOIN history_scope scope ON scope."typeId" = event."subjectTypeId" AND scope.id = event."subjectId"
    WHERE event."companyId" = ${companyId} AND event."subjectKind" = 'record' AND ${auditMatches(Prisma.sql`event."subjectTypeId"`, Prisma.sql`event."subjectId"`)}`);
  }
  if (enabled("audit") && workspace) {
    branches.push(Prisma.sql`SELECT event.id, 'audit'::text AS kind, event."createdAt" AS at FROM "EventLog" event
      WHERE event."companyId" = ${companyId} AND event.kind IN (${Prisma.join(systemActivityAuditEvents(canReadWiki))})`);
  }
  if (enabled("configuration") && workspace) {
    branches.push(Prisma.sql`SELECT revision.revision::text AS id, 'configuration'::text AS kind, revision."createdAt" AS at
      FROM "RecordSchemaRevision" revision WHERE revision."companyId" = ${companyId} AND revision.change IS NOT NULL`);
  }
  if (enabled("message")) {
    branches.push(Prisma.sql`SELECT message.id, 'message'::text AS kind, message."sentAt" AS at FROM "MessagingMessage" message
    JOIN "MessagingThread" thread ON thread."companyId" = ${companyId} AND thread.id = message."messagingThreadId"
    JOIN "ConnectedAccount" account ON account."companyId" = ${companyId} AND account.id = thread."connectedAccountId"
    WHERE message."companyId" = ${companyId} AND (${accountAccess} OR thread."sharedToCrm") AND NOT message."isHidden" AND NOT message."isDraft"
      AND (account."foldersSyncedAt" IS NULL OR cardinality(message."folderIds") = 0 OR message."folderIds" && account."selectedFolderIds")
      AND ${selected("provider", Prisma.sql`message.provider`)} AND ${selected("account", Prisma.sql`account.id`)} AND ${selected("thread", Prisma.sql`thread.id`)}
      AND ${scoped ? messageMatches() : Prisma.sql`TRUE`} AND ${matchingRecords((source) => messageMatches(source))}`);
  }
  if (enabled("activity") && !includedThread) {
    branches.push(Prisma.sql`SELECT activity.id, 'activity'::text AS kind, activity."occurredAt" AS at FROM "AccountActivity" activity
    JOIN "ConnectedAccount" account ON account."companyId" = ${companyId} AND account.id = activity."connectedAccountId"
    WHERE activity."companyId" = ${companyId} AND ${accountAccess} AND ${selected("provider", Prisma.sql`account.provider`)} AND ${selected("account", Prisma.sql`account.id`)}
      AND ${scoped ? identity(Prisma.sql`account.provider::text`, Prisma.sql`activity.identifier`) : Prisma.sql`TRUE`}
      AND ${matchingRecords((source) => identity(Prisma.sql`account.provider::text`, Prisma.sql`activity.identifier`, source))}`);
  }
  if (enabled("calendar_event") && !includedThread) {
    branches.push(Prisma.sql`SELECT event.id, 'calendar_event'::text AS kind, event."startsAt" AS at FROM "CalendarEvent" event
    JOIN "ConnectedAccount" account ON account."companyId" = ${companyId} AND account.id = event."connectedAccountId"
    WHERE event."companyId" = ${companyId} AND ${accountAccess} AND ${selected("provider", Prisma.sql`account.provider`)} AND ${selected("account", Prisma.sql`account.id`)}
      AND ${scoped ? calendarMatches() : Prisma.sql`TRUE`} AND ${matchingRecords((source) => calendarMatches(source))}`);
  }
  const cursor = input.cursor;
  const afterCursor = cursor
    ? Prisma.sql`(at, kind, id) < ((${cursor.at}::timestamptz AT TIME ZONE 'UTC'), ${cursor.kind}, ${cursor.id})`
    : Prisma.sql`TRUE`;
  const history = compileRecordHistoryScope(companyId, input, model, access);
  const query = Prisma.sql`WITH activity_scope AS (${scope}), history_scope AS (${history}),
    ${recordFilters.length ? Prisma.sql`${Prisma.join(recordFilters.map((filter) => filter.cte))},` : Prisma.empty}
    candidates AS (${branches.length ? Prisma.join(branches, " UNION ALL ") : Prisma.sql`SELECT NULL::text AS id, NULL::text AS kind, NULL::timestamp AS at WHERE FALSE`})
    SELECT id, kind, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM candidates WHERE ${afterCursor}
    AND ${input.after ? Prisma.sql`at >= (${input.after}::timestamptz AT TIME ZONE 'UTC')` : Prisma.sql`TRUE`}
    AND ${input.before ? Prisma.sql`at <= (${input.before}::timestamptz AT TIME ZONE 'UTC')` : Prisma.sql`TRUE`}
    ORDER BY at DESC, kind DESC, id DESC LIMIT ${input.limit + 1}`;
  if (query.values.length > 12000 || query.sql.length > 1500000)
    throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
  return query;
}

export function compileRecordHistoryScope(
  companyId: string,
  input: RecordActivitiesInput,
  model: RecordModel,
  access: RecordAccessMap,
  activityScope: Prisma.Sql = Prisma.raw("activity_scope"),
) {
  const scope = input.scope;
  const restricted = scope.records.length > 0 || scope.typeIds.length > 0;
  const selected = model.types.filter(
    (type) =>
      !type.archived &&
      access.get(type.id)?.access === "all" &&
      (!restricted || scope.typeIds.includes(type.id) || scope.records.some((ref) => ref.typeId === type.id)),
  );
  const selection = selected.map((type) => {
    const ids = scope.records.filter((ref) => ref.typeId === type.id).map((ref) => ref.recordId);
    return Prisma.sql`(historical."typeId" = ${type.id} AND ${!restricted || scope.typeIds.includes(type.id) ? Prisma.sql`TRUE` : Prisma.sql`historical.id IN (${Prisma.join(ids)})`})`;
  });
  return Prisma.sql`SELECT "typeId", id FROM ${activityScope} WHERE audit ${
    selection.length
      ? Prisma.sql`
    UNION SELECT historical."typeId", historical.id FROM (
      SELECT event."subjectTypeId" AS "typeId", event."subjectId" AS id FROM "EventLog" event
      WHERE event."companyId" = ${companyId} AND event."subjectKind" = 'record'
    ) historical WHERE (${Prisma.join(selection, " OR ")}) AND NOT EXISTS (
      SELECT 1 FROM "CrmRecord" record WHERE record."companyId" = ${companyId} AND record."typeId" = historical."typeId" AND record.id = historical.id
    )`
      : Prisma.empty
  }`;
}
