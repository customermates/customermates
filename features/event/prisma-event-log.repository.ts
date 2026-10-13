import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { LegalAuditRecord } from "@/features/legal/legal-audit.schema";
import type { LegalAuditRepo } from "@/features/legal/legal-audit.repo";
import type { EventLogEntry, EventLogRepo } from "./event-log.repo";
import type { EventOutboxRepo } from "./event-outbox.repo";
import type { RecordEventLogRepo, RecordEventWrite } from "./record-event-log.repo";
import type { RecordRef } from "@/features/records/record-model.schema";

import { type EventLog, Prisma, RoutineTriggerKind } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { LegalAcceptanceAuditPayloadSchema, LegalNoticeAuditPayloadSchema } from "@/features/legal/legal-audit.schema";
import { DomainEvent } from "./domain-events";
import { subjectKindOf } from "./event-envelope";
import { EVENT_ADMISSION_ABANDONED, wakeEventOutbox } from "./event-outbox.repo";

const ABANDONED_RETRY_AT = new Date("9999-12-31T00:00:00.000Z");

export class PrismaEventLogRepo
  extends TenantRepository
  implements EventLogRepo, EventOutboxRepo, LegalAuditRepo, RecordEventLogRepo
{
  constructor(private readonly background: Pick<BackgroundTaskService, "dispatch">) {
    super();
  }

  @BypassTenantGuard
  async appendUnscoped(companyId: string, entry: EventLogEntry): Promise<void> {
    const now = new Date();
    await this.prisma.eventLog.create({
      data: {
        companyId,
        subjectKind: subjectKindOf(entry.kind),
        subjectId: entry.subjectId,
        actorId: entry.actorId,
        kind: entry.kind,
        payload: (entry.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdAt: now,
        nextAttemptAt: now,
        deliveredAt: entry.delivered ? now : null,
      },
    });
    if (!entry.delivered) await wakeEventOutbox(this.background, companyId);
  }

  @BypassTenantGuard
  async hasSubscribersUnscoped(companyId: string, kind: string): Promise<boolean> {
    const [webhook, routine] = await Promise.all([
      this.prisma.webhook.findFirst({
        where: { companyId, enabled: true, events: { has: kind } },
        select: { id: true },
      }),
      this.prisma.routine.findFirst({
        where: {
          companyId,
          enabled: true,
          deletedAt: null,
          triggerKind: RoutineTriggerKind.event,
          triggerEvents: { has: kind },
        },
        select: { id: true },
      }),
    ]);
    return Boolean(webhook || routine);
  }

  @BypassTenantGuard
  async findLegalEventsUnscoped(companyId: string): Promise<LegalAuditRecord[]> {
    const rows = await this.prisma.eventLog.findMany({
      where: { companyId, kind: { in: [DomainEvent.LEGAL_NOTICE_SENT, DomainEvent.LEGAL_DOCUMENTS_ACCEPTED] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true, subjectId: true, kind: true, payload: true, actorId: true },
    });
    return rows.map((row) => {
      const base = { createdAt: row.createdAt, entityId: row.subjectId, userId: row.actorId };
      if ((row.kind as DomainEvent) === DomainEvent.LEGAL_NOTICE_SENT) {
        const payload = LegalNoticeAuditPayloadSchema.safeParse(row.payload);
        return { ...base, event: DomainEvent.LEGAL_NOTICE_SENT, payload: payload.success ? payload.data : null };
      }
      const payload = LegalAcceptanceAuditPayloadSchema.safeParse(row.payload);
      return { ...base, event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, payload: payload.success ? payload.data : null };
    });
  }

  async getLastFieldWritersCompanyWide(companyId: string, targets: Array<{ ref: RecordRef; fieldId: string }>) {
    const writers = new Map<string, string>();
    if (!targets.length) return writers;
    const rows = await this.prisma.$queryRaw<
      Array<{ typeId: string; recordId: string; fieldId: string; actorId: string }>
    >(Prisma.sql`
      SELECT target."typeId", target."recordId", target."fieldId", writer."actorId"
      FROM (VALUES ${Prisma.join(
        targets.map(
          (target) => Prisma.sql`(${target.ref.typeId}::text, ${target.ref.recordId}::text, ${target.fieldId}::text)`,
        ),
      )}) AS target("typeId", "recordId", "fieldId")
      CROSS JOIN LATERAL (
        SELECT event."actorId" FROM "EventLog" event
        WHERE event."companyId" = ${companyId} AND event."subjectKind" = 'record' AND event."subjectTypeId" = target."typeId" AND event."subjectId" = target."recordId"
          AND event.payload->'changedFieldIds' @> jsonb_build_array(target."fieldId")
        ORDER BY event."createdAt" DESC, event.id DESC
        LIMIT 1
      ) writer
    `);
    for (const row of rows) writers.set(`${row.typeId}:${row.recordId}:${row.fieldId}`, row.actorId);
    return writers;
  }

  async hasRecordHistoryCompanyWide(companyId: string, ref: RecordRef): Promise<boolean> {
    const event = await this.prisma.eventLog.findFirst({
      where: { companyId, subjectKind: "record", subjectTypeId: ref.typeId, subjectId: ref.recordId },
      select: { id: true },
    });
    return Boolean(event);
  }

  async appendRecordEventCompanyWide(companyId: string, event: RecordEventWrite): Promise<void> {
    await this.prisma.eventLog.create({
      data: {
        companyId,
        id: event.id,
        subjectKind: "record",
        subjectTypeId: event.ref.typeId,
        subjectId: event.ref.recordId,
        actorId: event.actorId,
        causeId: event.causeId,
        kind: event.kind,
        payload: event.payload,
      },
    });
  }

  async eraseTrashedRecordPayloadsCompanyWide(companyId: string, trashItemIds: string[]): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "EventLog" event SET payload = jsonb_set(jsonb_set(event.payload, '{fields}', '[]'::jsonb), '{identities}', 'null'::jsonb)
      FROM "CrmRecord" record
      WHERE event."companyId" = ${companyId} AND event."subjectKind" = 'record'
        AND record."companyId" = ${companyId} AND record."trashItemId" = ANY(${trashItemIds}::text[]) AND record."deletedAt" IS NOT NULL
        AND event."subjectTypeId" = record."typeId" AND event."subjectId" = record.id
        AND jsonb_typeof(event.payload->'fields') = 'array'`);
  }

  async publishStagedRecordEventsCompanyWide(companyId: string, operationId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "EventLog" ("companyId", id, "subjectKind", "subjectTypeId", "subjectId", "actorId", "causeId", kind, payload, "createdAt", attempts, "nextAttemptAt")
      SELECT ${companyId}, stage.payload->>'id', 'record', stage.payload->'ref'->>'typeId', stage.payload->'ref'->>'recordId',
        stage.payload->>'actorId', stage.payload->>'causeId', stage.payload->>'kind', stage.payload->'payload', NOW(), 0, NOW()
      FROM "RecordStageRow" stage WHERE stage."companyId" = ${companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'event'
    `);
  }

  @BypassTenantGuard
  findUnscoped(companyId: string, eventId: string): Promise<EventLog | null> {
    return this.prisma.eventLog.findFirst({ where: { companyId, id: eventId } });
  }

  @BypassTenantGuard
  async markDeliveredUnscoped(event: EventLog, now: Date): Promise<boolean> {
    const result = await this.prisma.eventLog.updateMany({
      where: { companyId: event.companyId, id: event.id, deliveredAt: null, attempts: event.attempts },
      data: { deliveredAt: now, attempts: { increment: 1 }, lastFailureCode: null },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async deferUnscoped(event: EventLog, nextAttemptAt: Date): Promise<boolean> {
    const result = await this.prisma.eventLog.updateMany({
      where: { companyId: event.companyId, id: event.id, deliveredAt: null, attempts: event.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt, lastFailureCode: "admission_failed" },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async abandonUnscoped(event: EventLog): Promise<boolean> {
    const result = await this.prisma.eventLog.updateMany({
      where: { companyId: event.companyId, id: event.id, deliveredAt: null, attempts: event.attempts },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: ABANDONED_RETRY_AT,
        lastFailureCode: EVENT_ADMISSION_ABANDONED,
      },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async dueCompaniesUnscoped(now: Date, take: number): Promise<string[]> {
    const rows = await this.prisma.eventLog.groupBy({
      by: ["companyId"],
      where: { deliveredAt: null, nextAttemptAt: { lte: now } },
      _min: { nextAttemptAt: true },
      orderBy: [{ _min: { nextAttemptAt: "asc" } }, { companyId: "asc" }],
      take,
    });
    return rows.map((row) => row.companyId);
  }

  @BypassTenantGuard
  async dueEventsUnscoped(companyId: string, now: Date, take: number): Promise<string[]> {
    const rows = await this.prisma.eventLog.findMany({
      where: { companyId, deliveredAt: null, nextAttemptAt: { lte: now } },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    });
    return rows.map((row) => row.id);
  }
}
