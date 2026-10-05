import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import type { RecordEvent, AuditLog } from "@/generated/prisma";
import type { MessagingMessage } from "../messaging.schema";
import type { RecordActivitiesInput } from "./record-activities.schema";
import type { ActivityKind, ActivityThreadRef, ActivityCalendarEvent } from "./activities.schema";
import type { RecordActivityIndexRow } from "./record-activity-query";

export type RecordActivityActor = { firstName: string; lastName: string; email: string; avatarUrl: string | null };
export type RecordActivityMessage = { message: MessagingMessage; thread: ActivityThreadRef; senderIsMine: boolean };
export interface RecordActivitiesRepo {
  index(
    input: RecordActivitiesInput,
    model: RecordModel,
    access: RecordAccessMap,
    available: ActivityKind[],
  ): Promise<RecordActivityIndexRow[]>;
  eventsCompanyWide(ids: string[]): Promise<Array<RecordEvent & { actor: RecordActivityActor }>>;
  auditLogsCompanyWide(ids: string[]): Promise<Array<AuditLog & { actor: RecordActivityActor }>>;
  hasHistoryCompanyWide(ref: RecordRef): Promise<boolean>;
  messagesCompanyWide(ids: string[]): Promise<RecordActivityMessage[]>;
  activitiesCompanyWide(ids: string[]): Promise<
    Array<{
      id: string;
      at: Date;
      payload: Record<string, unknown>;
      provider: MessagingMessage["provider"];
      identifier: string | null;
    }>
  >;
  calendarEventsCompanyWide(
    ids: string[],
  ): Promise<Array<{ id: string; at: Date; event: ActivityCalendarEvent; attendeeEmails: string[] }>>;
  relatedRecords(
    index: RecordActivityIndexRow[],
    input: RecordActivitiesInput,
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<Array<{ kind: string; id: string; ref: RecordRef }>>;
}
