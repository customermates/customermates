import { Prisma, type RecordEvent } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { RecordEventOutboxRepo } from "./record-event-outbox.repo";

export class PrismaRecordEventOutboxRepo extends TenantRepository implements RecordEventOutboxRepo {
  @BypassTenantGuard
  findUnscoped(companyId: string, eventId: string): Promise<RecordEvent | null> {
    return this.prisma.recordEvent.findFirst({ where: { companyId, id: eventId } });
  }

  @BypassTenantGuard
  async markDeliveredUnscoped(event: RecordEvent, now: Date): Promise<void> {
    const result = await this.prisma.recordEvent.updateMany({
      where: { companyId: event.companyId, id: event.id, deliveredAt: null, attempts: event.attempts },
      data: { deliveredAt: now, attempts: { increment: 1 }, lastFailureCode: null },
    });
    if (result.count !== 1) throw new Error("Record event admission lost its transaction precondition");
  }

  @BypassTenantGuard
  async deferUnscoped(event: RecordEvent, nextAttemptAt: Date): Promise<boolean> {
    const result = await this.prisma.recordEvent.updateMany({
      where: { companyId: event.companyId, id: event.id, deliveredAt: null, attempts: event.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt, lastFailureCode: "admission_failed" },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async dueCompaniesUnscoped(now: Date, take: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string }>>(
      Prisma.sql`SELECT "companyId" FROM "RecordEvent"
        WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= ${now}
        GROUP BY "companyId" ORDER BY MIN("nextAttemptAt"), "companyId" LIMIT ${take}`,
    );
    return rows.map((row) => row.companyId);
  }

  @BypassTenantGuard
  async dueEventsUnscoped(companyId: string, now: Date, take: number): Promise<string[]> {
    const rows = await this.prisma.recordEvent.findMany({
      where: { companyId, deliveredAt: null, nextAttemptAt: { lte: now } },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    });
    return rows.map((row) => row.id);
  }
}
