import { recordReadPredicate } from "@/features/records/record-query";
import { BaseRepository } from "@/core/base/base-repository";
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

export class PrismaRecordActivitiesRepo extends BaseRepository implements RecordActivitiesRepo {
  index(input: RecordActivitiesInput, model: RecordModel, access: RecordAccessMap, available: ActivityKind[]) {
    return this.prisma.$queryRaw<RecordActivityIndexRow[]>(
      compileRecordActivityIndex(
        this.companyId,
        this.userId,
        input,
        model,
        access,
        available,
        this.hasPermission(Resource.wiki, Action.readAll),
      ),
    );
  }

  async eventsCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    const events = await this.prisma.recordEvent.findMany({
      where: { companyId: this.companyId, id: { in: ids } },
    });
    const actors = await this.prisma.user.findMany({
      where: {
        companyId: this.companyId,
        id: { in: events.map((event) => event.actorId) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
      },
    });
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    const missing: RecordActivityActor = {
      firstName: "",
      lastName: "",
      email: "",
      avatarUrl: null,
    };
    return events.map((event) => ({
      ...event,
      actor: byId.get(event.actorId) ?? missing,
    }));
  }

  async auditLogsCompanyWide(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId: this.companyId,
        id: { in: ids },
        ...(this.hasPermission(Resource.wiki, Action.readAll) ? {} : { event: { notIn: [...WIKI_PAGE_AUDIT_EVENTS] } }),
      },
    });
    const actors = await this.prisma.user.findMany({
      where: {
        companyId: this.companyId,
        id: { in: rows.map((row) => row.userId) },
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        id: true,
      },
    });
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    return rows.map((row) => ({
      ...row,
      actor: byId.get(row.userId) ?? {
        firstName: "",
        lastName: "",
        email: "",
        avatarUrl: null,
      },
    }));
  }

  async hasHistoryCompanyWide(ref: RecordRef) {
    const event = await this.prisma.recordEvent.findFirst({
      where: { companyId: this.companyId, ...ref },
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
      SELECT event.id, 'record'::text AS kind, event."typeId", event."recordId" FROM "RecordEvent" event
      JOIN history_scope scope ON scope."typeId" = event."typeId" AND scope.id = event."recordId"
      WHERE event."companyId" = ${this.companyId} AND ${recordIds.length ? Prisma.sql`event.id IN (${Prisma.join(recordIds)})` : Prisma.sql`FALSE`}
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
