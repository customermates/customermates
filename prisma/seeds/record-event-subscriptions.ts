import { presetId } from "@/features/records/crm-preset";
import { RecordEventSubscriptionSchema } from "@/features/records/record-event-subscription.schema";
import { Prisma } from "@/generated/prisma";
import type { SeedContext } from "./context";

export async function seedRecordEventSubscription(
  context: SeedContext,
  input: {
    id: string;
    kind: "routine" | "webhook";
    ownerUserId: string;
    events: string[];
    enabled: boolean;
    changedFields?: string[];
  },
) {
  const byType = new Map<string, Set<"record.created" | "record.updated" | "record.deleted">>();
  for (const event of input.events) {
    const match = /^(contact|organization|deal|service|task)\.(created|updated|deleted)$/.exec(event);
    if (!match) continue;
    const events = byType.get(match[1]) ?? new Set();
    events.add(`record.${match[2]}` as "record.created" | "record.updated" | "record.deleted");
    byType.set(match[1], events);
  }
  const events = [...new Set([...byType.values()].flatMap((events) => [...events]))].sort();
  const liveEvents = [
    ...new Set([
      ...input.events.filter((event) => !/^(contact|organization|deal|service|task)\./.test(event)),
      ...events,
    ]),
  ];
  if (!events.length) {
    await context.prisma.recordEventSubscription.deleteMany({
      where: { companyId: context.ids.company, id: input.id },
    });
    return liveEvents;
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
    sources: [...byType].map(([kind, events]) => ({
      query: { typeId: presetId(context.ids.company, kind), filters: [], relationships: [] },
      events: [...events].sort(),
      changedFieldIds: (input.changedFields ?? []).map((field) =>
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(field)
          ? field
          : presetId(context.ids.company, `${kind}.${field}`),
      ),
    })),
  });
  const data = {
    ...definition,
    companyId: context.ids.company,
    query: Prisma.DbNull,
    sources: definition.sources as Prisma.InputJsonValue,
  };
  await context.prisma.recordEventSubscription.upsert({
    where: { companyId_id: { companyId: context.ids.company, id: input.id } },
    create: data,
    update: data,
  });
  return liveEvents;
}
