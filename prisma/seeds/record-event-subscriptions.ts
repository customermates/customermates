import { presetId } from "@/features/records/crm-preset";
import { RecordEventSubscriptionSchema } from "@/features/records/record-event-subscription.schema";
import { Prisma } from "@/generated/prisma";
import type { SeedContext } from "./context";
import type { SyntheticRecordType } from "./custom-fields";

export type SyntheticRecordEvent = "record.created" | "record.updated" | "record.deleted";

export async function seedRecordEventSubscription(
  context: SeedContext,
  input: {
    id: string;
    kind: "routine" | "webhook";
    ownerUserId: string;
    events: string[];
    recordTypes: SyntheticRecordType[];
    enabled: boolean;
  },
): Promise<void> {
  const events = input.events.filter((event): event is SyntheticRecordEvent => event.startsWith("record.")).sort();
  if (!events.length || !input.recordTypes.length) {
    await context.prisma.recordEventSubscription.deleteMany({
      where: { companyId: context.ids.company, id: input.id },
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
      query: { typeId: presetId(context.ids.company, type), filters: [], relationships: [] },
      events,
      changedFieldIds: [],
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
}
