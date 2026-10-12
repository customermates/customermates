import type { RecordRepo } from "./record.repo";
import { recordAccessForActor } from "./record-access";
import { RecordHistoryReader } from "./record-history-reader";
import { RecordEventPayloadSchema } from "./record-event.schema";
import { RecordDeliveryEnvelopeSchema, type RecordDeliveryEnvelope } from "./record-delivery.schema";
import type { EventLog } from "@/generated/prisma";
import type { RecordEventMatchWithSubscription, RecordRecipientRepo } from "./record-recipient.repo";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { RecordQuerySchema, type RecordQuery } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";
import {
  RecordEventSubscriptionSchema,
  type RecordEventSubscriptionDefinition,
} from "./record-event-subscription.schema";

export class RecordRecipientReader {
  constructor(
    private readonly recordsForCompany: (companyId: string) => RecordRepo,
    private readonly recipients: RecordRecipientRepo,
  ) {}

  findEventMatches(
    event: Pick<EventLog, "companyId" | "id">,
    kind: "webhook" | "routine",
  ): Promise<RecordEventMatchWithSubscription[]> {
    return this.recipients.findEventMatchesUnscoped(event, kind);
  }

  readEvent(input: {
    companyId: string;
    userId: string;
    eventId: string;
    subscriptionId?: string;
    query?: RecordQuery;
    recheckSubscriptionSources?: boolean;
  }): Promise<RecordDeliveryEnvelope | null> {
    return runInTransaction(
      async () => {
        const { companyId, userId, eventId } = input;
        const records = this.recordsForCompany(companyId);
        const [actor, event, model, grants] = await Promise.all([
          this.recipients.findRecipientActorUnscoped(companyId, userId),
          this.recipients.findRecordEventUnscoped(companyId, eventId),
          records.getModel(),
          records.getGrants(),
        ]);
        if (!actor || !event) return null;
        let subscription: RecordEventSubscriptionDefinition | null = null;
        if (input.subscriptionId) {
          const match = await this.recipients.findSubscriptionMatchUnscoped(companyId, eventId, input.subscriptionId);
          if (
            !match ||
            !match.subscription.enabled ||
            match.subscription.ownerUserId !== userId ||
            match.subscriptionRevision !== match.subscription.revision
          )
            return null;
          const { companyId: subscriptionCompanyId, ...storedSubscription } = match.subscription;
          if (subscriptionCompanyId !== companyId) return null;
          subscription = RecordEventSubscriptionSchema.parse(storedSubscription);
        }
        const payload = RecordEventPayloadSchema.parse(event.payload);
        if (payload.ref.typeId !== event.subjectTypeId || payload.ref.recordId !== event.subjectId) return null;
        const policy = recordAccessForActor({ actor, model, grants, records, companyId, userId });
        const record = await new RecordHistoryReader(records).redact(payload, model, policy, "delivery");
        if (!record) return null;
        if (event.kind !== "record.deleted" && event.kind !== "record.deletedPermanently") {
          const sourceQueries = subscription?.sources?.length
            ? subscription.sources
                .filter(
                  (source) =>
                    source.query.typeId === event.subjectTypeId && source.events.some((kind) => kind === event.kind),
                )
                .map((source) => source.query)
            : subscription?.query
              ? [subscription.query]
              : [];
          if (input.recheckSubscriptionSources && subscription?.sources?.length && !sourceQueries.length) return null;
          const matchesQuery = async (
            raw: NonNullable<RecordEventSubscriptionDefinition["query"]>,
          ): Promise<boolean> => {
            const query = RecordQuerySchema.parse(raw);
            if (query.typeId !== event.subjectTypeId || invalidRecordQueryPart(query, model)) return false;
            return this.recipients.matchesRecordQueryUnscoped({
              companyId,
              query,
              model,
              access: policy.access(model.types.map((type) => type.id)),
              subjectId: event.subjectId,
            });
          };
          if (input.query && !(await matchesQuery(input.query))) return null;
          if (input.recheckSubscriptionSources && sourceQueries.length) {
            let matched = false;
            for (const query of sourceQueries) if (await matchesQuery(query)) matched = true;
            if (!matched) return null;
          }
        }
        return RecordDeliveryEnvelopeSchema.parse({
          event: event.kind,
          id: event.id,
          timestamp: event.createdAt.toISOString(),
          companyId,
          actorId: event.actorId,
          data: { causeId: event.causeId, cause: payload.cause, record },
        });
      },
      { companyId: input.companyId, readOnly: true },
    );
  }
}
