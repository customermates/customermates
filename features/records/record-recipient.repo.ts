import type { EventLog, Prisma, RecordEventMatch, RecordEventSubscription } from "@/generated/prisma";
import type { RecordActor } from "./record.repo";

export type RecordEventMatchWithSubscription = RecordEventMatch & { subscription: RecordEventSubscription };

export abstract class RecordRecipientRepo {
  abstract findRecipientActorUnscoped(companyId: string, userId: string): Promise<RecordActor | null>;
  abstract findRecordEventUnscoped(companyId: string, eventId: string): Promise<EventLog | null>;
  abstract findSubscriptionMatchUnscoped(
    companyId: string,
    eventId: string,
    subscriptionId: string,
  ): Promise<RecordEventMatchWithSubscription | null>;
  abstract findEventMatchesUnscoped(
    event: Pick<EventLog, "companyId" | "id">,
    kind: "webhook" | "routine",
  ): Promise<RecordEventMatchWithSubscription[]>;
  abstract matchesRecordQueryUnscoped(matching: Prisma.Sql, subjectId: string | null): Promise<boolean>;
}
