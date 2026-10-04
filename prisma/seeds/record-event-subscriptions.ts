import { presetId } from "@/features/records/crm-preset";
import { RecordEventSubscriptionSchema } from "@/features/records/record-event-subscription.schema";
import { Prisma } from "@/generated/prisma";
import type { SeedContext } from "./context";

const LEGACY_RECORD_EVENT = /^(contact|organization|deal|service|task)\.(created|updated|deleted)$/;

type GenericRecordEvent = "record.created" | "record.updated" | "record.deleted";

function genericRecordEventsByType(events: readonly string[]) {
  const byType = new Map<string, Set<GenericRecordEvent>>();
  for (const event of events) {
    const match = LEGACY_RECORD_EVENT.exec(event);
    if (!match) continue;
    const generic = byType.get(match[1]) ?? new Set();
    generic.add(`record.${match[2]}` as GenericRecordEvent);
    byType.set(match[1], generic);
  }
  return byType;
}

export function liveSeedEvents(events: readonly string[]): string[] {
  const generic = [...new Set([...genericRecordEventsByType(events).values()].flatMap((set) => [...set]))].sort();
  return [...new Set([...events.filter((event) => !LEGACY_RECORD_EVENT.test(event)), ...generic])];
}

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
  const byType = genericRecordEventsByType(input.events);
  const events = [...new Set([...byType.values()].flatMap((events) => [...events]))].sort();
  const liveEvents = liveSeedEvents(input.events);
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
