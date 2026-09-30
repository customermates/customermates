import type { RecordRepo } from "./record.repo";
import { recordAccessForActor } from "./record-access";
import { RecordHistoryReader } from "./record-history-reader";
import { RecordEventPayloadSchema } from "./record-event.schema";
import { RecordDeliveryEnvelopeSchema, type RecordDeliveryEnvelope } from "./record-delivery.schema";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { prisma, type AppPrismaClient } from "@/prisma/db";
import { Prisma } from "@/generated/prisma";
import { RecordQuerySchema, type RecordQuery } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";
import { compileRecordQuery } from "./record-query";
import {
  RecordEventSubscriptionSchema,
  type RecordEventSubscriptionDefinition,
} from "./record-event-subscription.schema";

export class RecordRecipientReader {
  constructor(private readonly recordsForCompany: (companyId: string) => RecordRepo) {}
  @BypassTenantGuard
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
        const client = getTransactionClient<AppPrismaClient>() ?? prisma;
        const records = this.recordsForCompany(companyId);
        const [actor, event, model, grants] = await Promise.all([
          client.user.findFirst({
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
          }),
          client.recordEvent.findFirst({ where: { companyId, id: eventId } }),
          records.getModel(),
          records.getGrants(),
        ]);
        if (!actor || !event) return null;
        let subscription: RecordEventSubscriptionDefinition | null = null;
        if (input.subscriptionId) {
          const match = await client.recordEventMatch.findFirst({
            where: { companyId, eventId, subscriptionId: input.subscriptionId },
            include: { subscription: true },
          });
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
        if (payload.ref.typeId !== event.typeId || payload.ref.recordId !== event.recordId) return null;
        const policy = recordAccessForActor({ actor, model, grants, records, companyId, userId });
        const record = await new RecordHistoryReader(records).redact(payload, model, policy, "delivery");
        if (!record) return null;
        if (event.kind !== "record.deleted") {
          const sourceQueries = subscription?.sources?.length
            ? subscription.sources
                .filter(
                  (source) => source.query.typeId === event.typeId && source.events.some((kind) => kind === event.kind),
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
            if (query.typeId !== event.typeId || invalidRecordQueryPart(query, model)) return false;
            const sql = compileRecordQuery(companyId, query, model, policy.access(model.types.map((type) => type.id)));
            const matched = await client.$queryRaw<Array<{ matches: boolean }>>(
              Prisma.sql`SELECT EXISTS (SELECT 1 FROM (${sql.matching}) matching WHERE matching.id = ${event.recordId}) AS matches`,
            );
            return Boolean(matched[0]?.matches);
          };
          if (input.query && !(await matchesQuery(input.query))) return null;
          if (input.recheckSubscriptionSources && sourceQueries.length) {
            let matched = false;
            for (const query of sourceQueries) if (await matchesQuery(query)) matched = true;
            if (!matched) return null;
          }
        }
        return RecordDeliveryEnvelopeSchema.parse({
          version: 2,
          id: event.id,
          companyId,
          event: event.kind,
          timestamp: event.createdAt.toISOString(),
          actorId: event.actorId,
          causeId: event.causeId,
          cause: payload.cause,
          record,
        });
      },
      { companyId: input.companyId, readOnly: true },
    );
  }
}
