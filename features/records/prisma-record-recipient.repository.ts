import type { EventLog } from "@/generated/prisma";
import type { RecordActor } from "./record.repo";
import type { RecordEventMatchWithSubscription, RecordRecipientRepo } from "./record-recipient.repo";

import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaRecordRecipientRepo extends TenantRepository implements RecordRecipientRepo {
  @BypassTenantGuard
  findRecipientActorUnscoped(companyId: string, userId: string): Promise<RecordActor | null> {
    return this.prisma.user.findFirst({
      where: { companyId, id: userId, status: "active", role: { companyId } },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            id: true,
            companyId: true,
            isSystemRole: true,
            permissions: { where: { companyId }, select: { resource: true, action: true } },
          },
        },
      },
    });
  }

  @BypassTenantGuard
  findRecordEventUnscoped(companyId: string, eventId: string): Promise<EventLog | null> {
    return this.prisma.eventLog.findFirst({ where: { companyId, id: eventId, subjectKind: "record" } });
  }

  @BypassTenantGuard
  findSubscriptionMatchUnscoped(
    companyId: string,
    eventId: string,
    subscriptionId: string,
  ): Promise<RecordEventMatchWithSubscription | null> {
    return this.prisma.recordEventMatch.findFirst({
      where: { companyId, eventId, subscriptionId },
      include: { subscription: true },
    });
  }

  @BypassTenantGuard
  findEventMatchesUnscoped(
    event: Pick<EventLog, "companyId" | "id">,
    kind: "webhook" | "routine",
  ): Promise<RecordEventMatchWithSubscription[]> {
    return this.prisma.recordEventMatch.findMany({
      where: {
        companyId: event.companyId,
        eventId: event.id,
        subscription: { companyId: event.companyId, kind, enabled: true },
      },
      include: { subscription: true },
    });
  }

  @BypassTenantGuard
  async matchesRecordQueryUnscoped(matching: Prisma.Sql, subjectId: string | null): Promise<boolean> {
    const matched = await this.prisma.$queryRaw<Array<{ matches: boolean }>>(
      Prisma.sql`SELECT EXISTS (SELECT 1 FROM (${matching}) matching WHERE matching.id = ${subjectId}) AS matches`,
    );
    return Boolean(matched[0]?.matches);
  }
}
