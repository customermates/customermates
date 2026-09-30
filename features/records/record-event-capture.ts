import { Prisma } from "@/generated/prisma";
import type { AppPrismaClient } from "@/prisma/db";
import type { RecordRepo } from "./record.repo";
import { recordAccessForActor } from "./record-access";
import { RecordEventSubscriptionSchema } from "./record-event-subscription.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";
import { compileRecordQuery } from "./record-query";

export async function captureRecordEventMatches(
  client: AppPrismaClient,
  records: RecordRepo,
  companyId: string,
  selection: { eventId: string } | { operationId: string },
): Promise<void> {
  const rows = await client.recordEventSubscription.findMany({
    where: { companyId, enabled: true, owner: { companyId, status: "active", role: { companyId } } },
    include: {
      owner: {
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
      },
    },
  });
  if (!rows.length) return;
  const selected =
    "eventId" in selection
      ? Prisma.sql`event.id = ${selection.eventId}`
      : Prisma.sql`EXISTS (SELECT 1 FROM "RecordStageRow" stage
        WHERE stage."companyId" = ${companyId} AND stage."operationId" = ${selection.operationId}
          AND stage.kind = 'event' AND stage.payload->>'id' = event.id)`;
  const [model, grants, types] = await Promise.all([
    records.getModel(),
    records.getGrants(),
    client.$queryRaw<Array<{ typeId: string }>>(Prisma.sql`
      SELECT DISTINCT event."typeId" FROM "RecordEvent" event
      WHERE event."companyId" = ${companyId} AND ${selected}`),
  ]);
  for (const { owner, companyId: rowCompanyId, ...stored } of rows) {
    if (rowCompanyId !== companyId) throw new Error("Foreign record event subscription");
    const subscription = RecordEventSubscriptionSchema.parse(stored);
    const policy = recordAccessForActor({ actor: owner, model, grants, records, companyId, userId: owner.id });
    const access = policy.access(model.types.map((item) => item.id));
    for (const { typeId } of types) {
      if (!subscription.sources?.length && subscription.typeId && subscription.typeId !== typeId) continue;
      const type = model.types.find((candidate) => candidate.id === typeId);
      if (!type || type.archived) continue;
      const sources = subscription.sources?.length
        ? subscription.sources.filter((source) => source.query.typeId === typeId)
        : [
            {
              query: subscription.query ?? { typeId },
              changedFieldIds: subscription.changedFieldIds,
              events: subscription.events,
            },
          ];
      if (!sources.length) continue;
      const deletedAccess = policy.allowed(typeId, "readAll")
        ? Prisma.sql`TRUE`
        : !type.parentRelationshipId && policy.allowed(typeId, "readOwn")
          ? Prisma.sql`COALESCE(event.payload->'assignments'->'before', '[]'::jsonb) ? ${owner.id}`
          : Prisma.sql`FALSE`;
      const recursion =
        subscription.kind === "routine" ? Prisma.sql`NOT (event.payload->'cause' ? 'routineDepth')` : Prisma.sql`TRUE`;
      for (const source of sources) {
        const query = RecordQuerySchema.parse(source.query);
        if (invalidRecordQueryPart(query, model)) continue;
        const compiled = compileRecordQuery(companyId, query, model, access);
        const changed = source.changedFieldIds.length
          ? Prisma.sql`(event.kind <> 'record.updated' OR (event.payload->'changedFieldIds') ?| ARRAY[${Prisma.join(source.changedFieldIds)}]::text[])`
          : Prisma.sql`TRUE`;
        await client.$executeRaw(Prisma.sql`
          INSERT INTO "RecordEventMatch" ("companyId", "eventId", "subscriptionId", "subscriptionRevision")
          SELECT ${companyId}, event.id, ${subscription.id}, ${subscription.revision}
          FROM "RecordEvent" event
          WHERE event."companyId" = ${companyId} AND ${selected} AND event."typeId" = ${typeId}
            AND event.kind IN (${Prisma.join(source.events)}) AND ${changed} AND ${recursion}
            AND ((event.kind = 'record.deleted' AND ${deletedAccess}) OR
              (event.kind <> 'record.deleted' AND EXISTS (SELECT 1 FROM (${compiled.matching}) matching WHERE matching.id = event."recordId")))
          ON CONFLICT ("companyId", "eventId", "subscriptionId") DO NOTHING`);
      }
    }
  }
}
