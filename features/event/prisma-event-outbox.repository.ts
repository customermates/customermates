import { Prisma, type EventLog } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { EventOutboxRepo } from "./event-outbox.repo";

export class PrismaEventOutboxRepo extends TenantRepository implements EventOutboxRepo {
  @BypassTenantGuard
  findUnscoped(companyId: string, eventId: string): Promise<EventLog | null> {
    return this.prisma.eventLog.findFirst({ where: { companyId, id: eventId } });
  }

  @BypassTenantGuard
  async markDeliveredUnscoped(event: EventLog, now: Date): Promise<void> {
    const result = await this.prisma.eventLog.updateMany({
      where: { companyId: event.companyId, id: event.id, deliveredAt: null, attempts: event.attempts },
      data: { deliveredAt: now, attempts: { increment: 1 }, lastFailureCode: null },
    });
    if (result.count !== 1) throw new Error("Event admission lost its transaction precondition");
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
  async dueCompaniesUnscoped(now: Date, take: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string }>>(
      Prisma.sql`SELECT "companyId" FROM "EventLog"
        WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= ${now}
        GROUP BY "companyId" ORDER BY MIN("nextAttemptAt"), "companyId" LIMIT ${take}`,
    );
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
