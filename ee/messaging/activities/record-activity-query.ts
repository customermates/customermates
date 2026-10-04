import { recordChannelsEnabled } from "@/features/records/record-channels";
import { Prisma } from "@/generated/prisma";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import { recordReadPredicate } from "@/features/records/record-query";
import { RecordWriteError } from "@/features/records/record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { ActivityKind } from "./activities.schema";
import type { RecordActivitiesInput } from "./record-activities.schema";
import { LEGACY_RECORD_KINDS } from "@/features/records/legacy-record-history";
import { presetId } from "@/features/records/crm-preset";
import { systemActivityAuditEvents } from "./system-audit-events";

export type RecordActivityIndexRow = {
  id: string;
  kind: "record" | "audit" | "message" | "activity" | "calendar_event";
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
  const paths = model.activityPaths.filter(
    (path) =>
      !path.archived &&
      model.types.some((type) => type.id === path.typeId && !type.archived) &&
      (!restricted || scope.typeIds.includes(path.typeId) || scope.records.some((ref) => ref.typeId === path.typeId)),
  );
  const branches = paths
    .map((path, branch) => {
      let typeId = path.typeId;
      const root = Prisma.raw(`activity_root_${branch}`);
      let current = Prisma.raw(`activity_frontier_${branch}_0`);
      const allowed = (typeId: string, record: Prisma.Sql) =>
        recordReadPredicate(companyId, access.get(typeId) ?? { access: "none", userId }, record);
      const ids = scope.records.filter((ref) => ref.typeId === path.typeId).map((ref) => ref.recordId);
      const rootSelection =
        !restricted || scope.typeIds.includes(path.typeId)
          ? Prisma.sql`TRUE`
          : ids.length
            ? Prisma.sql`${root}.id IN (${Prisma.join(ids)})`
            : Prisma.sql`FALSE`;
      const frontiers = [
        Prisma.sql`${current} AS MATERIALIZED (
        SELECT ${root}."typeId", ${root}.id FROM "CrmRecord" ${root}
        WHERE ${root}."companyId" = ${companyId} AND ${root}."typeId" = ${path.typeId}
        AND ${rootSelection} AND ${allowed(typeId, root)})`,
      ];
      for (const [index, step] of path.path.entries()) {
        const relationship = model.relationships.find(
          (relation) => relation.id === step.relationId && !relation.archived,
        );
        if (!relationship) return null;
        const outgoing = step.direction === "outgoing";
        if (typeId !== (outgoing ? relationship.sourceTypeId : relationship.targetTypeId)) return null;
        typeId = outgoing ? relationship.targetTypeId : relationship.sourceTypeId;
        if (!model.types.some((type) => type.id === typeId && !type.archived)) return null;
        const target = Prisma.raw(`activity_target_${branch}_${index}`);
        const link = Prisma.raw(`activity_link_${branch}_${index}`);
        const next = Prisma.raw(`activity_frontier_${branch}_${index + 1}`);
        const sourceColumn = outgoing ? Prisma.sql`${link}."sourceId"` : Prisma.sql`${link}."targetId"`;
        const targetColumn = outgoing ? Prisma.sql`${link}."targetId"` : Prisma.sql`${link}."sourceId"`;
        frontiers.push(Prisma.sql`${next} AS MATERIALIZED (
          SELECT DISTINCT ${target}."typeId", ${target}.id FROM ${current}
          JOIN LATERAL (SELECT * FROM "RecordLink" ${link}
            WHERE ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${step.relationId}
            AND ${link}."sourceTypeId" = ${relationship.sourceTypeId} AND ${link}."targetTypeId" = ${relationship.targetTypeId}
            AND ${sourceColumn} = ${current}.id OFFSET 0) ${link} ON TRUE
          JOIN LATERAL (SELECT ${target}."typeId", ${target}.id FROM "CrmRecord" ${target}
            WHERE ${target}."companyId" = ${companyId} AND ${target}."typeId" = ${typeId} AND ${target}.id = ${targetColumn}
            AND ${allowed(typeId, target)} OFFSET 0) ${target} ON TRUE)`);
        current = next;
      }
      const identity = path.includeMessages && recordChannelsEnabled(model, typeId);
      return Prisma.sql`(WITH ${Prisma.join(frontiers)}
        SELECT ${current}."typeId", ${current}.id, ${path.includeAudit}::boolean AS audit,
        ${identity}::boolean AS messaging, ${path.includeMessages}::boolean AS threading FROM ${current})`;
    })
    .filter((branch): branch is Prisma.Sql => branch !== null);
  const direct = model.types.filter(
    (type) =>
      !type.archived &&
      (!restricted || scope.typeIds.includes(type.id) || scope.records.some((ref) => ref.typeId === type.id)),
  );
  for (const type of direct) {
    const ids = scope.records.filter((ref) => ref.typeId === type.id).map((ref) => ref.recordId);
    const selected =
      !restricted || scope.typeIds.includes(type.id)
        ? Prisma.sql`TRUE`
        : Prisma.sql`record.id IN (${Prisma.join(ids)})`;
    branches.push(Prisma.sql`SELECT record."typeId", record.id, FALSE AS audit, FALSE AS messaging, TRUE AS threading
      FROM "CrmRecord" record WHERE record."companyId" = ${companyId} AND record."typeId" = ${type.id}
      AND ${selected} AND ${recordReadPredicate(companyId, access.get(type.id) ?? { access: "none", userId }, Prisma.sql`record`)}`);
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
  if (enabled("audit") && !accountOrProviderFilter && !includedThread) {
    if (!scoped && recordFilters.every(({ filter }) => filter.operator === "notIn" || filter.operator === "hasNone")) {
      branches.push(Prisma.sql`SELECT event.id, 'audit'::text AS kind, event."createdAt" AS at FROM "AuditLog" event
        WHERE event."companyId" = ${companyId} AND event.event IN (${Prisma.join(systemActivityAuditEvents(canReadWiki))})`);
    }
    branches.push(Prisma.sql`SELECT event.id, 'record'::text AS kind, event."createdAt" AS at FROM "RecordEvent" event
    JOIN history_scope scope ON scope."typeId" = event."typeId" AND scope.id = event."recordId"
    WHERE event."companyId" = ${companyId} AND ${auditMatches(Prisma.sql`event."typeId"`, Prisma.sql`event."recordId"`)}`);
    branches.push(Prisma.sql`SELECT event.id, 'audit'::text AS kind, event."createdAt" AS at FROM "AuditLog" event
      JOIN legacy_types legacy ON legacy.event = event.event
      JOIN history_scope scope ON scope."typeId" = legacy."typeId" AND scope.id = event."entityId"
      WHERE event."companyId" = ${companyId} AND ${auditMatches(Prisma.sql`legacy."typeId"`, Prisma.sql`event."entityId"`)}`);
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
  const query = Prisma.sql`WITH legacy_types AS (${compileLegacyActivityTypes(companyId)}), activity_scope AS (${scope}), history_scope AS (${history}),
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

export function compileLegacyActivityTypes(companyId: string) {
  return Prisma.sql`SELECT * FROM (VALUES ${Prisma.join(
    LEGACY_RECORD_KINDS.flatMap((kind) =>
      ["created", "updated", "deleted"].map(
        (action) => Prisma.sql`(${`${kind}.${action}`}::text, ${presetId(companyId, kind)}::text)`,
      ),
    ),
  )}) types(event, "typeId")`;
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
      model.activityPaths.some(
        (path) => path.typeId === type.id && !path.archived && path.includeAudit && !path.path.length,
      ) &&
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
      SELECT event."typeId", event."recordId" AS id FROM "RecordEvent" event WHERE event."companyId" = ${companyId}
      UNION SELECT legacy."typeId", event."entityId" AS id FROM "AuditLog" event JOIN legacy_types legacy ON legacy.event = event.event WHERE event."companyId" = ${companyId}
    ) historical WHERE (${Prisma.join(selection, " OR ")}) AND NOT EXISTS (
      SELECT 1 FROM "CrmRecord" record WHERE record."companyId" = ${companyId} AND record."typeId" = historical."typeId" AND record.id = historical.id
    )`
      : Prisma.empty
  }`;
}
