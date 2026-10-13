import type { EventLog } from "@/generated/prisma";
import type { RecordActor } from "./record.repo";
import type { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import type { RecordEventMatchWithSubscription, RecordQueryMatch, RecordRecipientRepo } from "./record-recipient.repo";
import { compileRecordQuery } from "./record-query";

import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaRecordRecipientRepo extends TenantRepository implements RecordRecipientRepo {
  constructor(private actors: Pick<PrismaUserRepo, "findRecordActorUnscoped">) {
    super();
  }

  @BypassTenantGuard
  findRecipientActorUnscoped(companyId: string, userId: string): Promise<RecordActor | null> {
    return this.actors.findRecordActorUnscoped(companyId, userId);
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
  async matchesRecordQueryUnscoped(args: RecordQueryMatch): Promise<boolean> {
    const matched = await this.prisma.$queryRaw<Array<{ matches: boolean }>>(
      Prisma.sql`SELECT EXISTS (SELECT 1 FROM (${compileRecordQuery(args.companyId, args.query, args.model, args.access).matching}) matching WHERE matching.id = ${args.subjectId}) AS matches`,
    );
    return Boolean(matched[0]?.matches);
  }
}
