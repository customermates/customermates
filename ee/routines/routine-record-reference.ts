import { z } from "zod";
import { presetId } from "@/features/records/crm-preset";
import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import { entityTypeForEvent } from "./routine-event-filter";

export function routineRecordReference(
  event: string | null | undefined,
  payload: unknown,
  entityId?: string | null,
): RecordRef | null {
  const current = RecordDeliveryEnvelopeSchema.safeParse(payload);
  if (current.success) return current.data.record.ref;
  const legacyType = event ? entityTypeForEvent(event) : null;
  const legacy = z.object({ companyId: z.uuid(), entityId: z.uuid().optional() }).safeParse(payload);
  const id = z.uuid().safeParse(entityId ?? (legacy.success ? legacy.data.entityId : undefined));
  return legacyType && legacy.success && id.success
    ? { typeId: presetId(legacy.data.companyId, legacyType), recordId: id.data }
    : null;
}
