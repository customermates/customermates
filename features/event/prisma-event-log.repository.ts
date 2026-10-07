import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { LegalAuditRecord } from "@/features/legal/legal-audit.schema";
import type { LegalAuditRepo } from "@/features/legal/legal-audit.repo";
import type { EventLogEntry, EventLogRepo } from "./event-log.repo";

import { Prisma, RoutineTriggerKind } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { LegalAcceptanceAuditPayloadSchema, LegalNoticeAuditPayloadSchema } from "@/features/legal/legal-audit.schema";
import { DomainEvent } from "./domain-events";
import { subjectKindOf } from "./event-envelope";
import { wakeEventOutbox } from "./event-outbox.repo";

export class PrismaEventLogRepo extends TenantRepository implements EventLogRepo, LegalAuditRepo {
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
        where: { companyId, enabled: true, triggerKind: RoutineTriggerKind.event, triggerEvents: { has: kind } },
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
}
