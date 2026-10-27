import { presetId } from "@/features/records/crm-preset";
import { RecordEventSubscriptionSchema } from "@/features/records/record-event-subscription.schema";
import { Prisma } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma";

export type SyntheticRecordEvent = "record.created" | "record.updated" | "record.deleted";

export async function seedRecordEventSubscription(
  prisma: PrismaClient,
  companyId: string,
  input: {
    id: string;
    kind: "routine" | "webhook";
    ownerUserId: string;
    events: string[];
    recordTypes: string[];
    enabled: boolean;
  },
): Promise<void> {
  const events = input.events.filter((event): event is SyntheticRecordEvent => event.startsWith("record.")).sort();
  if (!events.length || !input.recordTypes.length) {
    await prisma.recordEventSubscription.deleteMany({
      where: { companyId, id: input.id },
    });
    return;
  }
  const definition = RecordEventSubscriptionSchema.parse({
    id: input.id,
    kind: input.kind,
    ownerUserId: input.ownerUserId,
    typeId: null,
    query: null,
    events,
    changedFieldIds: [],
    revision: 1,
    enabled: input.enabled,
    sources: input.recordTypes.map((type) => ({
      query: { typeId: presetId(companyId, type), filters: [], relationships: [] },
      events,
      changedFieldIds: [],
    })),
  });
  const data = {
    ...definition,
    companyId,
    query: Prisma.DbNull,
    sources: definition.sources as Prisma.InputJsonValue,
  };
  await prisma.recordEventSubscription.upsert({
    where: { companyId_id: { companyId, id: input.id } },
    create: data,
    update: data,
  });
}
