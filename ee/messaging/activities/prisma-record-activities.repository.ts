import type { PermissionService } from "@/core/base/permission.service";
import { recordReadPredicate } from "@/features/records/record-query";
import { TenantRepository } from "@/core/base/tenant-repository";
import { Action, Prisma, Resource } from "@/generated/prisma";
import type { RecordActivitiesRepo, RecordActivityActor } from "./record-activities.repo";
import type { RecordActivitiesInput } from "./record-activities.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import type { ActivityKind, ActivityCalendarEvent } from "./activities.schema";
import type { MessagingMessage } from "../messaging.schema";
import {
  compileRecordActivityIndex,
  compileRecordActivityScope,
  compileRecordHistoryScope,
  type RecordActivityIndexRow,
} from "./record-activity-query";
import { formatChannelIdentifier, threadCounterpart } from "../thread-display";
import type { RecordRef } from "@/features/records/record-model.schema";
import { WIKI_PAGE_AUDIT_EVENTS } from "@/features/wiki/wiki-audit-events";
import { RecordRevisionChangeSchema } from "@/features/records/record-revision.schema";
import { RecordModelSchema } from "@/features/records/record-model.schema";

export class PrismaRecordActivitiesRepo extends TenantRepository implements RecordActivitiesRepo {
  constructor(private readonly permissions: PermissionService) {
    super();
  }

  index(input: RecordActivitiesInput, model: RecordModel, access: RecordAccessMap, available: ActivityKind[]) {
    return this.prisma.$queryRaw<RecordActivityIndexRow[]>(
      compileRecordActivityIndex(
        this.companyId,
        this.userId,
        input,
        model,
        access,
        available,
        this.permissions.has(Resource.wiki, Action.readAll),
      ),
    );
  }

  private async actorsCompanyWide(ids: Array<string | null>) {
    const actors = await this.prisma.user.findMany({
      where: { companyId: this.companyId, id: { in: ids.filter((id): id is string => Boolean(id)) } },
      select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
    });
    const byId = new Map(actors.map(({ id, ...actor }) => [id, actor]));
    const system: RecordActivityActor = { firstName: "", lastName: "", email: "", avatarUrl: null };
    return (id: string | null) => (id ? byId.get(id) : undefined) ?? system;
  }

  async eventsCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    const events = await this.prisma.eventLog.findMany({
      where: {
        companyId: this.companyId,
        id: { in: ids },
        ...(this.permissions.has(Resource.wiki, Action.readAll)
          ? {}
          : { kind: { notIn: [...WIKI_PAGE_AUDIT_EVENTS] } }),
      },
    });
    const actor = await this.actorsCompanyWide(events.map((event) => event.actorId));
    return events.map((event) => ({ ...event, actor: actor(event.actorId) }));
  }

  async configurationsCompanyWide(ids: string[]) {
    const requested = ids.map(Number);
    const rows = requested.length
      ? await this.prisma.recordSchemaRevision.findMany({
          where: {
            companyId: this.companyId,
            revision: { in: [...new Set(requested.flatMap((revision) => [revision, revision - 1]))] },
          },
          select: { revision: true, createdAt: true, actorId: true, change: true, snapshot: true },
        })
      : [];
    const snapshots = new Map(rows.map((row) => [row.revision, RecordModelSchema.parse(row.snapshot)]));
    const parsed = rows.flatMap((row) => {
      if (!requested.includes(row.revision)) return [];
      const result = RecordRevisionChangeSchema.safeParse(row.change);
      return result.success
        ? [{ revision: row.revision, createdAt: row.createdAt, actorId: row.actorId, change: result.data }]
        : [];
    });
    const [actor, roles] = await Promise.all([
      this.actorsCompanyWide(parsed.map((revision) => revision.actorId)),
      parsed.length
        ? this.prisma.userRole.findMany({ where: { companyId: this.companyId }, select: { id: true, name: true } })
        : [],
    ]);
    return {
      revisions: parsed.map(({ actorId, ...revision }) => ({
        ...revision,
        actor: actor(actorId),
        models: [revision.revision, revision.revision - 1].flatMap((key) => {
          const model = snapshots.get(key);
          return model ? [model] : [];
        }),
      })),
      roleNames: new Map(roles.map((role) => [role.id, role.name])),
    };
  }

  async membersCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.user.findMany({
      where: { companyId: this.companyId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
  }

  async hasHistoryCompanyWide(ref: RecordRef) {
    const event = await this.prisma.eventLog.findFirst({
      where: { companyId: this.companyId, subjectKind: "record", subjectTypeId: ref.typeId, subjectId: ref.recordId },
      select: { id: true },
    });
    return Boolean(event);
  }

  async messagesCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.messagingMessage.findMany({
      where: { companyId: this.companyId, id: { in: ids } },
      include: {
        thread: { include: { participants: true } },
        connectedAccount: { select: { userId: true } },
      },
    });
    return rows.map(({ thread, connectedAccount, ...message }) => {
      const participant = threadCounterpart(thread.participants);
      const name =
        participant?.displayName?.trim() || formatChannelIdentifier(thread.provider, participant?.identifier) || "";
      const label = thread.type === "single" ? name || thread.subject?.trim() || "" : thread.name?.trim() || name;
      return {
        message: message as unknown as MessagingMessage,
        thread: { id: thread.id, type: thread.type, label },
        senderIsMine: message.direction === "outbound" && connectedAccount.userId === this.userId,
      };
    });
  }

  async activitiesCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.accountActivity.findMany({
      where: { companyId: this.companyId, id: { in: ids } },
      include: { connectedAccount: { select: { provider: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      at: row.occurredAt,
      payload: row.payload as Record<string, unknown>,
      provider: row.connectedAccount.provider,
      identifier: row.identifier,
    }));
  }

  async calendarEventsCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.calendarEvent.findMany({
      where: { companyId: this.companyId, id: { in: ids } },
      include: { connectedAccount: { select: { provider: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      at: row.startsAt,
      attendeeEmails: row.attendeeEmails,
      event: {
        ...row,
        provider: row.connectedAccount.provider,
        attendees: row.attendees ?? [],
        organizer: row.organizer ?? null,
      } as unknown as ActivityCalendarEvent,
    }));
  }

  async relatedRecords(
    index: RecordActivityIndexRow[],
    input: RecordActivitiesInput,
    model: RecordModel,
    access: RecordAccessMap,
  ) {
    const records = index.filter((row) => row.kind === "record");
    const messageIds = index.filter((row) => row.kind === "message").map((row) => row.id);
    if (!records.length && !messageIds.length) return [];
    const scope = compileRecordActivityScope(this.companyId, this.userId, input, model, access);
    const history = compileRecordHistoryScope(this.companyId, input, model, access);
    const recordIds = records.map((row) => row.id);
    const readableTypes = model.types
      .filter((type) => !type.archived)
      .map(
        (type) =>
          Prisma.sql`(record."typeId" = ${type.id} AND ${recordReadPredicate(this.companyId, access.get(type.id) ?? { access: "none", userId: this.userId }, Prisma.sql`record`)})`,
      );
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; kind: string; typeId: string; recordId: string }>
    >(Prisma.sql`
      WITH activity_scope AS (${scope}), history_scope AS (${history})
      SELECT event.id, 'record'::text AS kind, event."subjectTypeId" AS "typeId", event."subjectId" AS "recordId" FROM "EventLog" event
      JOIN history_scope scope ON scope."typeId" = event."subjectTypeId" AND scope.id = event."subjectId"
      WHERE event."companyId" = ${this.companyId} AND event."subjectKind" = 'record' AND ${recordIds.length ? Prisma.sql`event.id IN (${Prisma.join(recordIds)})` : Prisma.sql`FALSE`}
      UNION ALL SELECT message.id, 'message'::text AS kind, association."typeId", association."recordId"
      FROM "MessagingMessage" message
      JOIN "MessagingThreadRecordLink" association ON association."companyId" = ${this.companyId} AND association."threadId" = message."messagingThreadId"
      JOIN "CrmRecord" record ON record."companyId" = ${this.companyId} AND record."typeId" = association."typeId" AND record.id = association."recordId"
      WHERE message."companyId" = ${this.companyId} AND ${messageIds.length ? Prisma.sql`message.id IN (${Prisma.join(messageIds)})` : Prisma.sql`FALSE`}
        AND (${readableTypes.length ? Prisma.join(readableTypes, " OR ") : Prisma.sql`FALSE`})
    `);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      ref: { typeId: row.typeId, recordId: row.recordId },
    }));
  }
}
