import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";
import type { RecordRef } from "@/features/records/record-model.schema";

export function routineRecordReference(payload: unknown): RecordRef | null {
  const current = RecordDeliveryEnvelopeSchema.safeParse(payload);
  return current.success ? current.data.record.ref : null;
}
