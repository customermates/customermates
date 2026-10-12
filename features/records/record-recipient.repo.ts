import type { EventLog, RecordEventMatch, RecordEventSubscription } from "@/generated/prisma";
import type { RecordModel } from "./record-model.schema";
import type { RecordAccessMap, RecordQuery } from "./record-query.schema";
import type { RecordActor } from "./record.repo";

export type RecordQueryMatch = {
  companyId: string;
  query: RecordQuery;
  model: RecordModel;
  access: RecordAccessMap;
  subjectId: string | null;
};

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
  abstract matchesRecordQueryUnscoped(args: RecordQueryMatch): Promise<boolean>;
}
